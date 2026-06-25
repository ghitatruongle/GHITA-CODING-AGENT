// ==============================================================================
// Phase 33: Usage Dashboard — aggregation & analytics
// ==============================================================================

import type { UsageSummary, UsageRecord } from './types.js';
import type { UsageTracker } from './usage-tracker.js';

export interface DashboardOptions {
  /** Số record tối đa giữ trong cache */
  maxRecords?: number;
}

export interface TimeSeriesPoint {
  /** Bucket start (epoch ms) */
  timestamp: number;
  /** Requests trong bucket */
  requests: number;
  /** Tokens trong bucket */
  tokens: number;
  /** Cost trong bucket */
  cost: number;
}

export type TimeBucket = 'hour' | 'day' | 'week' | 'month';

/**
 * UsageDashboard — cung cấp view tổng quan & time series cho admin/user.
 *
 * Sử dụng:
 *   const dashboard = new UsageDashboard(tracker);
 *   const summary = dashboard.summary('u1', Date.now() - 30*86400_000, Date.now());
 *   const series = dashboard.timeSeries('u1', start, end, 'day');
 */
export class UsageDashboard {
  constructor(private readonly tracker: UsageTracker) {}

  /**
   * Tổng quan usage cho user trong khoảng thời gian.
   */
  summary(userId: string, periodStart: number, periodEnd: number): UsageSummary {
    return this.tracker.summary(userId, periodStart, periodEnd);
  }

  /**
   * Time series chia bucket.
   */
  timeSeries(
    userId: string,
    start: number,
    end: number,
    bucket: TimeBucket = 'day',
  ): TimeSeriesPoint[] {
    const records = this.tracker.query(userId, start, end);
    const bucketMs = this.bucketToMs(bucket);
    const buckets = new Map<number, TimeSeriesPoint>();

    for (const r of records) {
      const bStart = Math.floor(r.timestamp / bucketMs) * bucketMs;
      const point = buckets.get(bStart) ?? { timestamp: bStart, requests: 0, tokens: 0, cost: 0 };
      point.requests += 1;
      point.tokens += r.totalTokens;
      point.cost += r.costUsd;
      buckets.set(bStart, point);
    }

    return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Top models theo token usage.
   */
  topModels(
    userId: string,
    start: number,
    end: number,
    n = 5,
  ): Array<{ model: string; tokens: number; cost: number }> {
    const summary = this.tracker.summary(userId, start, end);
    return Object.entries(summary.byModel)
      .map(([model, v]) => ({ model, tokens: v.tokens, cost: v.cost }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, n);
  }

  /**
   * Lấy tất cả records (cho export).
   */
  export(userId?: string): UsageRecord[] {
    if (!userId) return this.tracker.all();
    const all = this.tracker.all();
    return all.filter((r) => r.userId === userId);
  }

  private bucketToMs(bucket: TimeBucket): number {
    switch (bucket) {
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
      case 'week':
        return 7 * 24 * 60 * 60 * 1000;
      case 'month':
        return 30 * 24 * 60 * 60 * 1000;
    }
  }
}
