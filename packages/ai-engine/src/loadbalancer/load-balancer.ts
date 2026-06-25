// ==============================================================================
// GHITA CODING AGENT - Load Balancer (Phase 28)
// Main engine: routing, health checks, rate limiting, failover.
// ==============================================================================

import type { AIProviderType } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse } from '../types.js';
import type {
  HealthSnapshot,
  HealthState,
  LoadBalancerConfig,
  LoadBalancerEvent,
  LoadBalancerEventListener,
  LoadBalancerStats,
  LoadBalancedAdapter,
  LoadBalancedAttempt,
  LoadBalancedProvider,
  LoadBalancedRequest,
  LoadBalancedResult,
  RateLimitState,
  RoutingDecision,
} from './types.js';
import { DEFAULT_LOAD_BALANCER_CONFIG } from './types.js';
import { RateLimiter } from './rate-limiter.js';
import { HealthChecker } from './health-checker.js';
import { filterEligible, pickProvider } from './router.js';

// ---------------------------------------------------------------------------
// Load Balancer
// ---------------------------------------------------------------------------

export class LoadBalancer {
  private config: LoadBalancerConfig;
  private adapters: Map<string, LoadBalancedAdapter> = new Map();
  private providers: LoadBalancedProvider[] = [];
  private health: Map<string, HealthSnapshot> = new Map();
  private rateLimiter: RateLimiter;
  private healthChecker: HealthChecker;
  private listeners: LoadBalancerEventListener[] = [];

  // Stats
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private failoverCount = 0;
  private rateLimitedCount = 0;
  private latencySamples: number[] = [];
  private decisionLatencySamples: number[] = [];
  private maxSamples = 1000;
  private startedAt = Date.now();
  private roundRobinIndex = 0;
  private nextRequestId = 1;

  // Per-provider stats
  private providerStats: Map<
    string,
    {
      requests: number;
      successes: number;
      failures: number;
      latencySamples: number[];
    }
  > = new Map();

  constructor(config: LoadBalancerConfig) {
    this.config = {
      ...DEFAULT_LOAD_BALANCER_CONFIG,
      ...config,
      healthCheck: { ...DEFAULT_LOAD_BALANCER_CONFIG.healthCheck, ...config.healthCheck },
      rateLimiter: { ...DEFAULT_LOAD_BALANCER_CONFIG.rateLimiter, ...config.rateLimiter },
      failover: { ...DEFAULT_LOAD_BALANCER_CONFIG.failover, ...config.failover },
    };
    this.providers = [...config.providers];
    this.rateLimiter = new RateLimiter(this.config.rateLimiter);
    this.healthChecker = new HealthChecker(
      this.config.healthCheck,
      (providerId, state, previous) => {
        this.onHealthChanged(providerId, state, previous);
      },
    );
    this.initProviderStats();
  }

  // --- Adapter registration ----------------------------------------------

  registerAdapter(adapter: LoadBalancedAdapter): void {
    this.adapters.set(adapter.type, adapter);
    // Start health checks for matching providers
    for (const p of this.providers) {
      if (p.type === adapter.type) {
        this.healthChecker.start(p, adapter);
      }
    }
  }

  registerAdapters(adapters: LoadBalancedAdapter[]): void {
    for (const a of adapters) this.registerAdapter(a);
  }

  unregisterAdapter(type: AIProviderType): boolean {
    for (const p of this.providers) {
      if (p.type === type) this.healthChecker.stop(p.id);
    }
    return this.adapters.delete(type);
  }

  // --- Provider pool management ------------------------------------------

  addProvider(provider: LoadBalancedProvider): void {
    this.providers.push(provider);
    this.initProviderStatsFor(provider.id);
    const adapter = this.adapters.get(provider.type);
    if (adapter) this.healthChecker.start(provider, adapter);
  }

  removeProvider(providerId: string): boolean {
    this.healthChecker.stop(providerId);
    this.health.delete(providerId);
    this.providerStats.delete(providerId);
    const before = this.providers.length;
    this.providers = this.providers.filter((p) => p.id !== providerId);
    return this.providers.length < before;
  }

  setProviderEnabled(providerId: string, enabled: boolean, reason = 'manual'): void {
    const p = this.providers.find((x) => x.id === providerId);
    if (!p) return;
    const wasEnabled = p.enabled;
    p.enabled = enabled;
    if (wasEnabled && !enabled) {
      this.emit({ type: 'provider-disabled', providerId, reason });
    } else if (!wasEnabled && enabled) {
      this.emit({ type: 'provider-enabled', providerId });
    }
  }

  updateProviderWeight(providerId: string, weight: number): void {
    const p = this.providers.find((x) => x.id === providerId);
    if (p) p.weight = weight;
  }

  getProviders(): LoadBalancedProvider[] {
    return [...this.providers];
  }

  // --- Routing ------------------------------------------------------------

  pick(tag?: string, preferProviderId?: string, providerType?: AIProviderType): RoutingDecision {
    // Refresh health map from checker
    this.syncHealth();

    // First: if a preferred provider is given and eligible, use it
    if (preferProviderId) {
      const preferred = this.providers.find((p) => p.id === preferProviderId);
      if (
        preferred &&
        preferred.enabled &&
        (!providerType || preferred.type === providerType) &&
        (!tag || preferred.tags.includes(tag))
      ) {
        const h = this.health.get(preferred.id);
        if (!h || h.state !== 'unhealthy') {
          return {
            provider: preferred,
            reason: 'only-healthy',
            decisionLatencyMs: 0,
            candidates: 1,
            poolSnapshot: this.providers.map((p) => p.id),
          };
        }
      }
    }

    // Filter by provider type and tag
    let pool = this.providers;
    if (providerType) pool = pool.filter((p) => p.type === providerType);
    if (tag) pool = filterEligible(pool, this.health, tag);
    else pool = filterEligible(pool, this.health);

    return pickProvider(
      pool.length > 0 ? pool : this.providers,
      this.health,
      this.config.strategy,
      Math.random,
      { roundRobinIndex: this.roundRobinIndex },
    );
  }

  // --- Public: execute a request -----------------------------------------

  /**
   * Send a chat request through the load balancer.
   * Handles routing, rate limiting, failover, retries, and stats.
   */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions & {
      tag?: string;
      preferProviderId?: string;
      providerType?: AIProviderType;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<ChatResponse> {
    const request: LoadBalancedRequest = {
      id: `req_${this.nextRequestId++}`,
      messages,
      options,
      tag: options?.tag,
      preferProviderId: options?.preferProviderId,
      providerType: options?.providerType,
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
      enqueuedAt: Date.now(),
    };
    const result = await this.execute(request);
    if (!result.ok || !result.response) {
      throw result.error ?? new Error('Load balanced request failed');
    }
    this.emit({ type: 'request-completed', requestId: request.id, result });
    return result.response;
  }

  /** Lower-level: build a result with full attempt history. */
  async execute(request: LoadBalancedRequest): Promise<LoadBalancedResult> {
    this.totalRequests++;
    const t0 = Date.now();
    const attempts: LoadBalancedAttempt[] = [];
    const maxRetries = this.config.failover.maxRetries;
    let lastError: Error | undefined;
    let decision: RoutingDecision | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Pick provider
      let routingDecision: RoutingDecision;
      try {
        routingDecision = this.pick(request.tag, request.preferProviderId, request.providerType);
        if (attempt === 0) decision = routingDecision;
        this.decisionLatencySamples.push(routingDecision.decisionLatencyMs);
        if (this.decisionLatencySamples.length > this.maxSamples) {
          this.decisionLatencySamples.shift();
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.failedRequests++;
        this.emit({ type: 'all-providers-down', at: Date.now() });
        break;
      }

      const provider = routingDecision.provider;
      const adapter = this.adapters.get(provider.type);
      if (!adapter) {
        attempts.push({
          providerId: provider.id,
          ok: false,
          error: new Error(`No adapter for type ${provider.type}`),
          startedAt: Date.now(),
          durationMs: 0,
        });
        continue;
      }

      // Rate limit check
      const rl = this.rateLimiter.tryAcquire(provider.id, provider.rateLimitPerMinute || undefined);
      if (!rl.allowed) {
        this.rateLimitedCount++;
        attempts.push({
          providerId: provider.id,
          ok: false,
          error: new Error(`Rate limited; retry after ${rl.retryAfterMs}ms`),
          startedAt: Date.now(),
          durationMs: 0,
          skipped: 'rate-limit',
        });
        this.emit({
          type: 'rate-limited',
          providerId: provider.id,
          retryAfterMs: rl.retryAfterMs,
        });
        // Try next provider
        if (attempt > 0) {
          this.emit({
            type: 'failover',
            fromProviderId: attempts[attempts.length - 2]?.providerId ?? '',
            toProviderId: provider.id,
            reason: 'rate-limit',
          });
        }
        // Try to pick another provider — set preferProviderId to a different one
        request.preferProviderId = this.pickAlternative(request, provider.id)?.id;
        continue;
      }

      // Execute
      const startedAt = Date.now();
      try {
        const response = await this.invokeAdapter(adapter, request, provider);
        const durationMs = Date.now() - startedAt;
        attempts.push({
          providerId: provider.id,
          ok: true,
          startedAt,
          durationMs,
        });
        this.recordProviderSuccess(provider.id, durationMs);
        this.successfulRequests++;
        this.latencySamples.push(Date.now() - t0);
        if (this.latencySamples.length > this.maxSamples) {
          this.latencySamples.shift();
        }
        return {
          requestId: request.id,
          ok: true,
          response,
          routingDecision,
          attempts,
          totalDurationMs: Date.now() - t0,
        };
      } catch (err) {
        const durationMs = Date.now() - startedAt;
        const error = err instanceof Error ? err : new Error(String(err));
        attempts.push({
          providerId: provider.id,
          ok: false,
          error,
          startedAt,
          durationMs,
        });
        this.recordProviderFailure(provider.id);
        lastError = error;
        this.failoverCount++;
        this.emit({
          type: 'failover',
          fromProviderId: provider.id,
          toProviderId: '',
          reason: error.message,
        });
        // Backoff before retry
        if (attempt < maxRetries) {
          await this.delay(this.config.failover.retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    this.failedRequests++;
    return {
      requestId: request.id,
      ok: false,
      error: lastError ?? new Error('All providers failed'),
      routingDecision: decision as RoutingDecision,
      attempts,
      totalDurationMs: Date.now() - t0,
    };
  }

  // --- Stats --------------------------------------------------------------

  get stats(): LoadBalancerStats {
    const avgLatency =
      this.latencySamples.length > 0
        ? this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
        : 0;
    const avgDecision =
      this.decisionLatencySamples.length > 0
        ? this.decisionLatencySamples.reduce((a, b) => a + b, 0) /
          this.decisionLatencySamples.length
        : 0;

    const providerStats = this.providers.map((p) => {
      const h = this.health.get(p.id);
      const s = this.providerStats.get(p.id);
      const providerLatency =
        s && s.latencySamples.length > 0
          ? s.latencySamples.reduce((a, b) => a + b, 0) / s.latencySamples.length
          : 0;
      return {
        id: p.id,
        type: p.type,
        state: h?.state ?? 'unknown',
        requests: s?.requests ?? 0,
        successes: s?.successes ?? 0,
        failures: s?.failures ?? 0,
        averageLatencyMs: providerLatency,
        rateLimit: this.rateLimiter.getState(p.id),
      };
    });

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      failoverCount: this.failoverCount,
      rateLimitedCount: this.rateLimitedCount,
      averageLatencyMs: avgLatency,
      averageDecisionLatencyMs: avgDecision,
      providers: providerStats,
      uptimeMs: Date.now() - this.startedAt,
    };
  }

  get healthSnapshots(): HealthSnapshot[] {
    return this.healthChecker.getAllSnapshots();
  }

  get rateLimitStates(): RateLimitState[] {
    return this.rateLimiter.getAllStates();
  }

  // --- Events ------------------------------------------------------------

  on(listener: LoadBalancerEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: LoadBalancerEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* swallow */
      }
    }
  }

  // --- Shutdown -----------------------------------------------------------

  async destroy(): Promise<void> {
    this.healthChecker.stopAll();
    this.rateLimiter.clear();
    this.listeners = [];
  }

  // --- Internals ---------------------------------------------------------

  private initProviderStats(): void {
    for (const p of this.providers) this.initProviderStatsFor(p.id);
  }

  private initProviderStatsFor(providerId: string): void {
    if (!this.providerStats.has(providerId)) {
      this.providerStats.set(providerId, {
        requests: 0,
        successes: 0,
        failures: 0,
        latencySamples: [],
      });
    }
  }

  private syncHealth(): void {
    for (const s of this.healthChecker.getAllSnapshots()) {
      this.health.set(s.providerId, s);
    }
  }

  private onHealthChanged(providerId: string, state: HealthState, previous: HealthState): void {
    const s = this.healthChecker.getSnapshot(providerId);
    if (s) this.health.set(providerId, s);
    this.emit({ type: 'health-changed', providerId, state, previous });

    // Auto-recover: re-enable provider when it becomes healthy again
    if (this.config.autoRecover && state === 'healthy') {
      const p = this.providers.find((x) => x.id === providerId);
      if (p && !p.enabled) {
        p.enabled = true;
        this.emit({ type: 'provider-enabled', providerId });
      }
    }
  }

  private pickAlternative(
    request: LoadBalancedRequest,
    excludeProviderId: string,
  ): LoadBalancedProvider | undefined {
    this.syncHealth();
    const eligible = filterEligible(
      this.providers.filter((p) => p.id !== excludeProviderId),
      this.health,
      request.tag,
    );
    return eligible[0];
  }

  private recordProviderSuccess(providerId: string, latencyMs: number): void {
    let s = this.providerStats.get(providerId);
    if (!s) {
      s = { requests: 0, successes: 0, failures: 0, latencySamples: [] };
      this.providerStats.set(providerId, s);
    }
    s.requests++;
    s.successes++;
    s.latencySamples.push(latencyMs);
    if (s.latencySamples.length > this.maxSamples) s.latencySamples.shift();
  }

  private recordProviderFailure(providerId: string): void {
    let s = this.providerStats.get(providerId);
    if (!s) {
      s = { requests: 0, successes: 0, failures: 0, latencySamples: [] };
      this.providerStats.set(providerId, s);
    }
    s.requests++;
    s.failures++;
  }

  private async invokeAdapter(
    adapter: LoadBalancedAdapter,
    request: LoadBalancedRequest,
    provider: LoadBalancedProvider,
  ): Promise<ChatResponse> {
    const callOptions: ChatOptions = {
      ...request.options,
      model: request.options?.model ?? provider.model,
    };
    if (request.timeoutMs) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), request.timeoutMs);
      callOptions.signal = ctrl.signal;
      try {
        return await adapter.chat(request.messages, callOptions);
      } finally {
        clearTimeout(timer);
      }
    }
    return adapter.chat(request.messages, callOptions);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      if (t && typeof t === 'object' && 'unref' in t) t.unref();
    });
  }
}
