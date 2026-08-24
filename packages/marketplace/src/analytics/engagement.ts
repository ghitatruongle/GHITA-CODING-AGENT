import type { EngagementEvent, TimeRange } from './types.js';

/**
 * Tracks user engagement events: views, installs, runs, ratings, shares.
 * Computes DAU/WAU/MAU, session metrics, retention.
 */
export class EngagementTracker {
  private events: EngagementEvent[] = [];

  /**
   * Record a new event.
   */
  record(
    event: Omit<EngagementEvent, 'id' | 'timestamp'> & { timestamp?: number },
  ): EngagementEvent {
    const e: EngagementEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: event.timestamp ?? Date.now(),
    };
    this.events.push(e);
    return e;
  }

  /**
   * Count events of a given type for a product in a range.
   */
  count(productId: string, type: EngagementEvent['type'], range?: TimeRange): number {
    return this.events.filter(
      (e) =>
        e.productId === productId &&
        e.type === type &&
        (!range || (e.timestamp >= range.start && e.timestamp < range.end)),
    ).length;
  }

  /**
   * Daily Active Users for a product in the given range.
   */
  dau(productId: string, range: TimeRange): Map<string, number> {
    const buckets = new Map<string, Set<string>>();
    for (const e of this.events) {
      if (e.productId !== productId) continue;
      if (e.timestamp < range.start || e.timestamp >= range.end) continue;
      const day = new Date(e.timestamp).toISOString().slice(0, 10);
      if (!buckets.has(day)) buckets.set(day, new Set());
      buckets.get(day)?.add(e.userId);
    }
    const out = new Map<string, number>();
    for (const [day, users] of buckets) out.set(day, users.size);
    return out;
  }

  /**
   * Average session duration for a product (sessions inferred by 30-min idle).
   */
  avgSessionDurationMs(productId: string, range?: TimeRange): number {
    const events = this.events
      .filter(
        (e) =>
          e.productId === productId &&
          (!range || (e.timestamp >= range.start && e.timestamp < range.end)),
      )
      .sort((a, b) => a.timestamp - b.timestamp);
    if (events.length === 0) return 0;

    const sessions: Array<{ start: number; end: number }> = [];
    const IDLE_MS = 30 * 60_000;
    let cur: { start: number; end: number } | undefined;
    for (const e of events) {
      if (!cur) {
        cur = { start: e.timestamp, end: e.timestamp };
        continue;
      }
      if (e.timestamp - cur.end > IDLE_MS) {
        sessions.push(cur);
        cur = { start: e.timestamp, end: e.timestamp };
      } else {
        cur.end = e.timestamp;
      }
    }
    if (cur) sessions.push(cur);
    const total = sessions.reduce((acc, s) => acc + (s.end - s.start), 0);
    return sessions.length > 0 ? total / sessions.length : 0;
  }

  /**
   * Cohort retention: of users active in startBucket, how many return in N days.
   */
  retention(productId: string, startBucketStart: number, days: number): number {
    const dayMs = 86_400_000;
    const endBucketStart = startBucketStart + dayMs;
    const cohort = new Set<string>();
    for (const e of this.events) {
      if (e.productId !== productId) continue;
      if (e.timestamp >= startBucketStart && e.timestamp < endBucketStart) {
        cohort.add(e.userId);
      }
    }
    if (cohort.size === 0) return 0;
    const targetStart = startBucketStart + days * dayMs;
    const targetEnd = targetStart + dayMs;
    const returning = new Set<string>();
    for (const e of this.events) {
      if (e.productId !== productId) continue;
      if (e.timestamp >= targetStart && e.timestamp < targetEnd) {
        returning.add(e.userId);
      }
    }
    let n = 0;
    for (const u of cohort) if (returning.has(u)) n++;
    return n / cohort.size;
  }

  /**
   * Dump all events.
   */
  listEvents(): EngagementEvent[] {
    return [...this.events];
  }
}
