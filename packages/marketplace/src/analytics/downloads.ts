// ==============================================================================
// GHITA CODING AGENT - Download Tracker (Phase 39)
// ==============================================================================

import type { DownloadStats, TimeRange } from './types.js';

/**
 * Tracks plugin / template / skill downloads with daily/weekly/version/country breakdowns.
 */
export class DownloadTracker {
  private stats = new Map<string, DownloadStats>();

  /**
   * Record a download event.
   */
  record(productId: string, opts: { version: string; country?: string; timestamp?: number } = { version: '0.0.0' }): void {
    const ts = opts.timestamp ?? Date.now();
    let s = this.stats.get(productId);
    if (!s) {
      s = {
        productId,
        total: 0,
        daily: new Map(),
        weekly: new Map(),
        byVersion: new Map(),
        byCountry: new Map(),
        updatedAt: ts,
      };
      this.stats.set(productId, s);
    }
    s.total++;
    const day = this.dayKey(ts);
    s.daily.set(day, (s.daily.get(day) ?? 0) + 1);
    const week = this.weekKey(ts);
    s.weekly.set(week, (s.weekly.get(week) ?? 0) + 1);
    s.byVersion.set(opts.version, (s.byVersion.get(opts.version) ?? 0) + 1);
    if (opts.country) s.byCountry.set(opts.country, (s.byCountry.get(opts.country) ?? 0) + 1);
    s.updatedAt = ts;
  }

  /**
   * Get stats for a product.
   */
  get(productId: string): DownloadStats | undefined {
    return this.stats.get(productId);
  }

  /**
   * Get downloads in a time range.
   */
  inRange(productId: string, range: TimeRange): number {
    const s = this.stats.get(productId);
    if (!s) return 0;
    let acc = 0;
    for (const [day, count] of s.daily) {
      const t = this.dayKeyToTs(day);
      if (t >= range.start && t < range.end) acc += count;
    }
    return acc;
  }

  /**
   * Get top N products by total downloads.
   */
  top(n: number): DownloadStats[] {
    return Array.from(this.stats.values()).sort((a, b) => b.total - a.total).slice(0, n);
  }

  private dayKey(ts: number): string {
    return new Date(ts).toISOString().slice(0, 10);
  }

  private weekKey(ts: number): string {
    const d = new Date(ts);
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  private dayKeyToTs(key: string): number {
    return new Date(`${key}T00:00:00Z`).getTime();
  }
}
