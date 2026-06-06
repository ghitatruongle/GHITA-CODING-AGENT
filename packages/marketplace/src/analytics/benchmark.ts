// ==============================================================================
// GHITA CODING AGENT - Performance Benchmarks (Phase 39)
// ==============================================================================

import type { BenchmarkResult, TrendingScore } from './types.js';
import type { DownloadTracker } from './downloads.js';
import type { EngagementTracker } from './engagement.js';

/**
 * Records + queries performance benchmarks for marketplace products.
 */
export class BenchmarkStore {
  private results: BenchmarkResult[] = [];

  /**
   * Record a benchmark result.
   */
  record(result: Omit<BenchmarkResult, 'timestamp'> & { timestamp?: number }): BenchmarkResult {
    const r: BenchmarkResult = { ...result, timestamp: result.timestamp ?? Date.now() };
    this.results.push(r);
    return r;
  }

  /**
   * Get all results for a product.
   */
  forProduct(productId: string): BenchmarkResult[] {
    return this.results.filter((r) => r.productId === productId);
  }

  /**
   * Get the most recent value for a (product, metric) pair.
   */
  latest(productId: string, metric: BenchmarkResult['metric']): BenchmarkResult | undefined {
    const matches = this.forProduct(productId).filter((r) => r.metric === metric);
    if (matches.length === 0) return undefined;
    return matches.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
  }

  /**
   * Average of all samples for a (product, metric) pair.
   */
  average(productId: string, metric: BenchmarkResult['metric']): number {
    const matches = this.forProduct(productId).filter((r) => r.metric === metric);
    if (matches.length === 0) return 0;
    const total = matches.reduce((acc, r) => acc + r.value, 0);
    return total / matches.length;
  }

  /**
   * Compute a percentile (0-100) for a (product, metric) pair.
   */
  percentile(productId: string, metric: BenchmarkResult['metric'], p: number): number {
    const values = this.forProduct(productId)
      .filter((r) => r.metric === metric)
      .map((r) => r.value)
      .sort((a, b) => a - b);
    if (values.length === 0) return 0;
    const idx = Math.min(values.length - 1, Math.floor((p / 100) * values.length));
    return values[idx] ?? 0;
  }

  /**
   * Build a trending score combining downloads + engagement + growth.
   */
  trendingScore(
    productId: string,
    downloads: DownloadTracker,
    engagement: EngagementTracker,
    now: number = Date.now(),
  ): TrendingScore {
    const day = 86_400_000;
    const recent = downloads.inRange(productId, { start: now - 7 * day, end: now });
    const prev = downloads.inRange(productId, { start: now - 14 * day, end: now - 7 * day });
    const installs = engagement.count(productId, 'install', { start: now - 7 * day, end: now });
    const views = engagement.count(productId, 'view', { start: now - 7 * day, end: now });
    const growth = prev === 0 ? 1 : (recent - prev) / prev;
    return {
      productId,
      score: recent * 0.5 + installs * 3 + views * 0.1 + growth * 10,
      components: { downloads: recent, engagement: installs + views, growth },
    };
  }
}
