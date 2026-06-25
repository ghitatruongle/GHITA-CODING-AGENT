// ==============================================================================
// GHITA CODING AGENT - Notification Channel Routing (Phase 35)
// ==============================================================================

import { randomUUID } from 'node:crypto';
import type {
  ChannelDelivery,
  Notification,
  NotificationChannel,
  NotificationListener,
  NotificationPreferences,
} from './types.js';
import { PriorityRouter } from './priority.js';

/** A pluggable delivery backend (desktop/mobile/email/...) */
export interface NotificationSink {
  readonly channel: NotificationChannel;
  send(notification: Notification): Promise<{ success: boolean; error?: string }>;
}

/** In-memory sink used as a fallback / for tests */
export class InMemorySink implements NotificationSink {
  readonly channel: NotificationChannel = 'in-app';
  readonly delivered: Notification[] = [];
  async send(n: Notification): Promise<{ success: boolean }> {
    this.delivered.push(n);
    return { success: true };
  }
}

/**
 * Routes a Notification to one or more NotificationSink instances, taking into
 * account user preferences, DND state, and quiet hours.
 */
export class ChannelRouter {
  private sinks = new Map<NotificationChannel, NotificationSink>();
  private router = new PriorityRouter();
  private listeners = new Set<NotificationListener>();

  registerSink(sink: NotificationSink): void {
    this.sinks.set(sink.channel, sink);
  }

  onNotification(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Route a notification to all eligible sinks. Returns the per-channel result.
   */
  async route(n: Notification, prefs: NotificationPreferences): Promise<ChannelDelivery[]> {
    const eligible = this.router.filterByPreferences(
      this.router.resolveChannels(n),
      n.priority,
      prefs.channels,
    );

    const inQuiet = this.isInQuietHours(prefs, new Date(n.createdAt));
    const dndActive = prefs.dndActive || inQuiet;
    const suppressedByDnd = dndActive && n.priority !== 'critical';

    if (suppressedByDnd) {
      n.status = 'suppressed';
      n.failureReason = inQuiet ? 'Within quiet hours' : 'DND active';
      this.emit(n);
      return eligible.map((c) => ({ channel: c, success: false, error: n.failureReason }));
    }

    const results: ChannelDelivery[] = [];
    for (const c of eligible) {
      const sink = this.sinks.get(c);
      if (!sink) {
        results.push({ channel: c, success: false, error: 'No sink registered' });
        continue;
      }
      const r = await sink.send(n);
      results.push({
        channel: c,
        success: r.success,
        error: r.error,
        deliveredAt: r.success ? Date.now() : undefined,
      });
    }
    const anySuccess = results.some((r) => r.success);
    n.status = anySuccess ? 'delivered' : 'failed';
    if (!anySuccess)
      n.failureReason =
        results
          .map((r) => r.error)
          .filter(Boolean)
          .join('; ') || 'Unknown error';
    if (anySuccess) n.deliveredAt = Date.now();
    this.emit(n);
    return results;
  }

  private isInQuietHours(prefs: NotificationPreferences, now: Date): boolean {
    if (prefs.quietHoursStart === undefined || prefs.quietHoursEnd === undefined) return false;
    const start = prefs.quietHoursStart;
    const end = prefs.quietHoursEnd;
    const h = now.getHours();
    if (start === end) return false;
    if (start < end) return h >= start && h < end;
    return h >= start || h < end; // wraps midnight
  }

  private emit(n: Notification): void {
    for (const l of this.listeners) {
      try {
        l(n);
      } catch {
        // ignore
      }
    }
  }

  static newId(): string {
    return `n_${randomUUID()}`;
  }
}

// ============================================================================
// Tauri Desktop Toast Sink
// ============================================================================

/**
 * Notification sink that delivers desktop toast notifications via the Tauri
 * notification plugin. Falls back gracefully when Tauri is unavailable.
 */
export class TauriNotificationSink implements NotificationSink {
  readonly channel: NotificationChannel = 'desktop';

  // Use indirect import to avoid compile-time module resolution
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  private dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<Record<string, unknown>>;

  private tauriAvailable: boolean | null = null;

  private async isAvailable(): Promise<boolean> {
    if (this.tauriAvailable !== null) return this.tauriAvailable;
    try {
      const mod = await this.dynamicImport('@tauri-apps/plugin-notification');
      this.tauriAvailable = typeof mod['sendNotification'] === 'function';
    } catch {
      this.tauriAvailable = false;
    }
    return this.tauriAvailable;
  }

  async send(n: Notification): Promise<{ success: boolean; error?: string }> {
    const available = await this.isAvailable();
    if (!available) {
      return { success: false, error: 'Tauri notification plugin not available' };
    }

    try {
      const mod = await this.dynamicImport('@tauri-apps/plugin-notification');

      // Check permission
      const isGranted = mod['isPermissionGranted'] as (() => Promise<boolean>) | undefined;
      if (isGranted) {
        const granted = await isGranted();
        if (!granted) {
          const request = mod['requestPermission'] as (() => Promise<string>) | undefined;
          if (request) {
            const perm = await request();
            if (perm !== 'granted') {
              return { success: false, error: `Notification permission: ${perm}` };
            }
          }
        }
      }

      const sendNotification = mod['sendNotification'] as (
        opts: Record<string, unknown>,
      ) => void;

      sendNotification({
        title: n.title,
        body: n.body,
        icon: undefined,
      });

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
