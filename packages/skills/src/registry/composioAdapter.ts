// Multi-account credential management, rate limiting, webhooks, and
// action execution for 50+ SaaS applications.

import {
  SAAS_APPS,
  type SaaSConnection,
  type SaaSAPILog,
  type SaaSAPIResponse,
  type SaaSCategory,
  type SaaSAppDefinition,
  type WebhookEvent,
  type WebhookHandler,
} from './saas-apps-registry.js';
import { simulateAction } from './simulator.js';
import { executeRealSaaSAction } from './saas-http-executor.js';

// Re-export types for backward compatibility
export type {
  SaaSConnection,
  SaaSAPILog,
  SaaSAPIResponse,
  SaaSCategory,
  SaaSAppDefinition,
  WebhookEvent,
  WebhookHandler,
} from './saas-apps-registry.js';

export class ComposioSkillAdapter {
  private sdk: unknown = null;
  private readonly credentials = new Map<string, SaaSConnection[]>();
  private readonly isolatedApps = new Set<string>();
  private readonly consecutiveFailures = new Map<string, number>();
  private readonly apiLogs: SaaSAPILog[] = [];
  private readonly rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
  private readonly webhookHandlers = new Map<string, WebhookHandler[]>();
  /**
   * v0.4.9: when true, actions with a real HTTP handler + an access token are
   * executed as genuine network calls. Default false so unit tests and offline
   * usage stay deterministic (they fall back to the flagged simulator).
   */
  private readonly realExecution: boolean;

  private constructor(
    options: { apiKey?: string; credentials?: SaaSConnection[]; realExecution?: boolean } = {},
  ) {
    this.realExecution = options.realExecution ?? false;
    if (options.credentials) {
      for (const conn of options.credentials) {
        this.setCredential(conn);
      }
    }
  }

  public static async create(
    options: { apiKey?: string; credentials?: SaaSConnection[]; realExecution?: boolean } = {},
  ): Promise<ComposioSkillAdapter> {
    const instance = new ComposioSkillAdapter(options);
    try {
      const moduleName = '@composio/core';
      const composioModule = await import(
        /* @vite-ignore */ /* webpackIgnore: true */ moduleName
      ).catch(() => null);
      if (composioModule) {
        const Composio = composioModule['Composio'] as new (opts: { apiKey?: string }) => unknown;
        instance.sdk = new Composio({ apiKey: options.apiKey });
      }
    } catch {
      // Keep sdk = null to trigger simulation fallback
    }
    return instance;
  }

  // --- Credential Management (Multi-Account) ---

  public setCredential(conn: SaaSConnection): void {
    const appId = conn.appId.toLowerCase();
    const existing = this.credentials.get(appId) ?? [];
    const filtered = existing.filter((c) => c.accountId !== conn.accountId);
    filtered.push(conn);
    this.credentials.set(appId, filtered);
    this.consecutiveFailures.set(appId, 0);
    // Fresh credentials mean the app is presumably healthy again; don't let a
    // stale fault-isolation flag block a reconnected account.
    this.isolatedApps.delete(appId);
  }

  public getCredential(appId: string, accountId?: string): SaaSConnection | undefined {
    const conns = this.credentials.get(appId.toLowerCase());
    if (!conns || conns.length === 0) return undefined;
    if (accountId) return conns.find((c) => c.accountId === accountId);
    return conns[0];
  }

  public syncCredentials(targetStore: Record<string, Omit<SaaSConnection, 'appId'>>): void {
    for (const [appId, conn] of Object.entries(targetStore)) {
      this.setCredential({ appId: appId.toLowerCase(), ...conn });
    }
  }

  public removeCredential(appId: string, accountId?: string): boolean {
    const key = appId.toLowerCase();
    if (accountId) {
      const conns = this.credentials.get(key);
      if (!conns) return false;
      const filtered = conns.filter((c) => c.accountId !== accountId);
      if (filtered.length === conns.length) return false;
      if (filtered.length === 0) this.credentials.delete(key);
      else this.credentials.set(key, filtered);
      return true;
    }
    return this.credentials.delete(key);
  }

  public listConnectedApps(): string[] {
    return Array.from(this.credentials.keys());
  }

  // --- Fault Isolation ---

  public isolateApp(appId: string): void {
    this.isolatedApps.add(appId.toLowerCase());
  }

  public releaseIsolation(appId: string): void {
    this.isolatedApps.delete(appId.toLowerCase());
    this.consecutiveFailures.set(appId.toLowerCase(), 0);
  }

  public isIsolated(appId: string): boolean {
    return this.isolatedApps.has(appId.toLowerCase());
  }

  public getIsolatedApps(): string[] {
    return Array.from(this.isolatedApps);
  }

  // --- Rate Limiting ---

  private checkRateLimit(appId: string): { allowed: boolean; retryAfterMs?: number } {
    const appDef = SAAS_APPS.find((a) => a.id === appId);
    if (!appDef) return { allowed: true };

    const bucket = this.rateLimitBuckets.get(appId);
    const now = Date.now();

    if (!bucket || now > bucket.resetAt) {
      this.rateLimitBuckets.set(appId, { count: 1, resetAt: now + appDef.rateLimit.windowMs });
      return { allowed: true };
    }

    if (bucket.count >= appDef.rateLimit.requests) {
      return { allowed: false, retryAfterMs: bucket.resetAt - now };
    }

    bucket.count++;
    return { allowed: true };
  }

  // --- OAuth Token Refresh ---

  /**
   * Checks whether an access token needs refreshing.
   *
   * v0.8.0: This method no longer fabricates tokens. Minting a mock
   * "refreshed_access_…" token made the connection appear valid when nothing
   * was actually refreshed, which is indistinguishable from a real bug.
   *
   * - Tokens that are not near expiry are left untouched (returns true).
   * - Tokens near expiry are ONLY refreshed through a real provider exchange.
   *   Since this adapter has no real refresh-token endpoint configured, near-
   *   expiry tokens are reported as needing attention and an honest error is
   *   surfaced instead of inventing a refresh.
   */
  public async interceptAndRefreshToken(appId: string): Promise<boolean> {
    const conn = this.getCredential(appId);
    if (!conn) return false;

    if (!conn.expiresAt || !conn.refreshToken) return true;

    const timeDiff = conn.expiresAt - Date.now();
    const FIVE_MINUTES_MS = 5 * 60 * 1000;

    if (timeDiff <= FIVE_MINUTES_MS) {
      // Tag the error so executeSaaSAction does NOT treat an expired token as a
      // transient fault: it is a deterministic credential problem, not a service
      // outage — counting it toward isolation would permanently lock the app
      // with no automatic recovery path.
      const err = new Error(
        `OAuth token for "${appId}" has expired or is near expiry and cannot be ` +
          'refreshed: no real provider refresh endpoint is configured. Reconnect the ' +
          'account with fresh credentials via a genuine OAuth exchange.',
      ) as Error & { code?: string };
      err.code = 'ghita_token_expired';
      throw err;
    }

    return true;
  }

  // --- Action Execution ---

  public async executeSaaSAction(
    actionName: string,
    params: Record<string, unknown> = {},
  ): Promise<SaaSAPIResponse> {
    const start = Date.now();
    const parts = actionName.split('.');
    const appId = parts[0]?.toLowerCase();
    const action = parts[1];

    if (!appId || !action) {
      return {
        success: false,
        error: `Invalid action name: "${actionName}". Format: "app.action".`,
      };
    }

    if (this.isIsolated(appId)) {
      const errorMsg = `App "${appId}" is isolated due to repeated failures.`;
      this.recordAPILog(appId, action, false, Date.now() - start, errorMsg);
      return { success: false, error: errorMsg };
    }

    const conn = this.getCredential(appId);
    if (!conn) {
      const errorMsg = `No credentials for "${appId}". Set credentials first.`;
      this.recordAPILog(appId, action, false, Date.now() - start, errorMsg);
      return { success: false, error: errorMsg };
    }

    // Rate limit check
    const rateCheck = this.checkRateLimit(appId);
    if (!rateCheck.allowed) {
      const errorMsg = `Rate limit exceeded for "${appId}". Retry after ${rateCheck.retryAfterMs}ms.`;
      this.recordAPILog(appId, action, false, Date.now() - start, errorMsg);
      return { success: false, error: errorMsg };
    }

    try {
      await this.interceptAndRefreshToken(appId);

      let data: unknown;

      if (this.sdk) {
        data = await (
          this.sdk as {
            executeAction: (name: string, params: Record<string, unknown>) => Promise<unknown>;
          }
        ).executeAction(actionName, {
          ...params,
          connectedAccount: conn.accessToken,
        });
      } else {
        // v0.4.9: attempt a REAL HTTP call first when real execution is enabled
        // and we hold an access token. Fall back to the simulator otherwise,
        // tagging plain-object results so callers never mistake a simulated
        // response for a live one. `simulate_failure` always forces the
        // simulator (it is an explicit testing hook).
        const real =
          this.realExecution && conn.accessToken && !params['simulate_failure']
            ? await executeRealSaaSAction(appId, action, params, conn.accessToken)
            : { handled: false as const };
        if (real.handled) {
          data = real.data;
        } else {
          const simulated = await simulateAction(appId, action, params);
          data =
            simulated !== null && typeof simulated === 'object' && !Array.isArray(simulated)
              ? { ...(simulated as Record<string, unknown>), _simulated: true }
              : simulated;
        }
      }

      this.consecutiveFailures.set(appId, 0);
      this.recordAPILog(appId, action, true, Date.now() - start);
      return { success: true, data };
    } catch (err: unknown) {
      const errorMsg = (err as { message?: string })?.message ?? String(err);

      // Deterministic credential failures (e.g. expired token) are not transient
      // service faults — skip fault isolation so reconnecting credentials clears
      // the situation instead of leaving the app permanently quarantined.
      const isCredentialError = (err as { code?: string })?.code === 'ghita_token_expired';
      if (!isCredentialError) {
        const currentFailures = (this.consecutiveFailures.get(appId) || 0) + 1;
        this.consecutiveFailures.set(appId, currentFailures);
        if (currentFailures >= 3) {
          this.isolateApp(appId);
        }
      }

      this.recordAPILog(appId, action, false, Date.now() - start, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  // --- Webhooks ---

  public registerWebhook(handler: WebhookHandler): void {
    const existing = this.webhookHandlers.get(handler.appId) ?? [];
    existing.push(handler);
    this.webhookHandlers.set(handler.appId, existing);
  }

  public unregisterWebhook(appId: string, event: string): void {
    const handlers = this.webhookHandlers.get(appId);
    if (!handlers) return;
    const filtered = handlers.filter((h) => !h.events.includes(event));
    if (filtered.length === 0) this.webhookHandlers.delete(appId);
    else this.webhookHandlers.set(appId, filtered);
  }

  public async processWebhook(event: WebhookEvent): Promise<void> {
    const handlers = this.webhookHandlers.get(event.appId) ?? [];
    for (const handler of handlers) {
      if (handler.events.includes(event.event)) {
        try {
          await handler.callback(event);
        } catch {
          // Log but don't throw to avoid blocking other handlers
        }
      }
    }
  }

  // --- App Registry ---

  public listAvailableApps(): SaaSAppDefinition[] {
    return [...SAAS_APPS];
  }

  public getAppsByCategory(category: SaaSCategory): SaaSAppDefinition[] {
    return SAAS_APPS.filter((a) => a.category === category);
  }

  public getAppDefinition(appId: string): SaaSAppDefinition | undefined {
    return SAAS_APPS.find((a) => a.id === appId);
  }

  // --- Logs ---

  private recordAPILog(
    appId: string,
    action: string,
    success: boolean,
    duration: number,
    error?: string,
  ): void {
    this.apiLogs.push({ timestamp: Date.now(), appId, action, success, duration, error });
  }

  public getLogs(): SaaSAPILog[] {
    return [...this.apiLogs];
  }

  public clearLogs(): void {
    this.apiLogs.length = 0;
  }
}
