// Debounced batch delivery with coalescing

import type { Notification, NotificationPreferences, ChannelDelivery } from './types.js';
import type { ChannelRouter } from './channel.js';

export interface BatchConfig {
  /** Maximum time (ms) to wait before flushing the batch */
  debounceMs: number;
  /** Maximum notifications to accumulate before auto-flush */
  maxBatchSize: number;
  /** Whether to coalesce duplicate notifications (same title+body) */
  coalesce: boolean;
}

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  debounceMs: 500,
  maxBatchSize: 10,
  coalesce: true,
};

export type BatchFlushListener = (results: ChannelDelivery[][]) => void;

/**
 * Accumulates notifications and delivers them in batches with debounce.
 * Optionally coalesces duplicate notifications (same title + body within the
 * batch window) to avoid spamming the user with repeated alerts.
 */
export class BatchDeliveryService {
  private config: BatchConfig;
  private queue: Notification[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private router: ChannelRouter;
  private prefs: NotificationPreferences;
  private listeners = new Set<BatchFlushListener>();

  constructor(router: ChannelRouter, prefs: NotificationPreferences, config?: Partial<BatchConfig>) {
    this.router = router;
    this.prefs = prefs;
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
  }

  /** Update batch configuration. */
  configure(config: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Update notification preferences. */
  setPreferences(prefs: NotificationPreferences): void {
    this.prefs = prefs;
  }

  /** Register a flush listener. Returns unsubscribe function. */
  onFlush(listener: BatchFlushListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Enqueue a notification for batch delivery. */
  enqueue(notification: Notification): void {
    if (this.config.coalesce) {
      const existing = this.queue.find(
        (n) => n.title === notification.title && n.body === notification.body,
      );
      if (existing) {
        // Increment count on existing notification instead of adding a duplicate
        (existing as Notification & { count?: number }).count =
          ((existing as Notification & { count?: number }).count ?? 1) + 1;
        this.scheduleFlush();
        return;
      }
    }

    this.queue.push(notification);

    if (this.queue.length >= this.config.maxBatchSize) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  /** Immediately flush all queued notifications. */
  async flush(): Promise<ChannelDelivery[][]> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const batch = this.queue.splice(0);
    if (batch.length === 0) return [];

    const results: ChannelDelivery[][] = [];
    for (const n of batch) {
      const r = await this.router.route(n, this.prefs);
      results.push(r);
    }

    for (const l of this.listeners) {
      try {
        l(results);
      } catch {
        // ignore
      }
    }

    return results;
  }

  /** Get the current queue size. */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** Clear the queue without delivering. */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }

  private scheduleFlush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.config.debounceMs);
  }
}
