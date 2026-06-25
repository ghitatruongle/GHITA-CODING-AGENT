// ==============================================================================
// GHITA CODING AGENT - Background Compression Job (Phase 30)
// Periodic runner that orchestrates dedup → summarization → tier migration.
// ==============================================================================

import type {
  CompressionConfig,
  CompressionEvent,
  CompressionEventListener,
  CompressionJobRun,
  CompressionStats,
  CompressableMemoryEntry,
  MemoryStorageAdapter,
} from './types.js';
import { DEFAULT_COMPRESSION_CONFIG } from './types.js';
import { EmbeddingDedup } from './embedding-dedup.js';
import { MemorySummarizer } from './summarizer.js';
import { TierManager } from './tier-manager.js';

// ---------------------------------------------------------------------------
// Background Job
// ---------------------------------------------------------------------------

export class BackgroundCompressionJob {
  private config: Required<CompressionConfig>;
  private storage: MemoryStorageAdapter;
  private dedup: EmbeddingDedup;
  private summarizer: MemorySummarizer;
  private tierManager: TierManager;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: CompressionEventListener[] = [];
  private stats = {
    totalRuns: 0,
    totalDeduped: 0,
    totalSummarized: 0,
    totalPromoted: 0,
    totalDemoted: 0,
    totalPruned: 0,
    totalCharsSaved: 0,
    durationSamples: [] as number[],
  };
  private lastRun: CompressionJobRun | null = null;
  private nextRunId = 1;
  private isRunning = false;

  constructor(storage: MemoryStorageAdapter, config?: Partial<CompressionConfig>) {
    this.config = {
      summarizer: { ...DEFAULT_COMPRESSION_CONFIG.summarizer, ...config?.summarizer },
      dedup: { ...DEFAULT_COMPRESSION_CONFIG.dedup, ...config?.dedup },
      tierMigration: {
        ...DEFAULT_COMPRESSION_CONFIG.tierMigration,
        ...config?.tierMigration,
      },
      job: { ...DEFAULT_COMPRESSION_CONFIG.job, ...config?.job },
    };
    this.storage = storage;
    this.dedup = new EmbeddingDedup(this.config.dedup);
    this.summarizer = new MemorySummarizer(this.config.summarizer);
    this.tierManager = new TierManager(this.config.tierMigration);
  }

  // --- Lifecycle ---------------------------------------------------------

  /** Start the periodic background job. */
  start(): void {
    if (this.timer) return;
    if (!this.config.job.enabled) return;
    const interval = this.config.job.intervalMs;
    this.timer = setInterval(() => {
      void this.runOnce().catch((err) => {
        this.emit({
          type: 'job-failed',
          runId: `run_${this.nextRunId - 1}`,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    }, interval);
    const timer = this.timer as unknown as { unref?: () => void };
    if (timer && typeof timer === 'object' && typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  /** Stop the periodic background job. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Run a single compression cycle. */
  async runOnce(): Promise<CompressionJobRun> {
    if (this.isRunning) {
      // Return the last run if already running
      return this.lastRun ?? this.emptyRun();
    }
    this.isRunning = true;
    const runId = `run_${this.nextRunId++}`;
    const startedAt = Date.now();
    this.emit({ type: 'job-started', runId });

    const errors: string[] = [];
    let deduped = 0;
    let summarized = 0;
    let promoted = 0;
    let demoted = 0;
    let pruned = 0;
    let charsSaved = 0;

    try {
      const all = await this.storage.list({
        limit: this.config.job.maxEntriesPerRun,
      });

      // --- 1. Dedup ---
      if (this.config.job.runDedup) {
        try {
          const dedupResult = await this.dedup.deduplicate(all);
          deduped = dedupResult.removed.length;
          charsSaved += dedupResult.charsSaved;
          if (dedupResult.removed.length > 0) {
            await this.storage.delete(dedupResult.removed);
          }
          this.emit({ type: 'dedup-completed', result: dedupResult });
        } catch (err) {
          errors.push(`dedup: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Re-fetch after dedup
      const afterDedup = await this.storage.list({
        limit: this.config.job.maxEntriesPerRun,
      });

      // --- 2. Summarization ---
      if (this.config.job.runSummarization) {
        try {
          // Summarize warm/cold-eligible entries
          const sumResult = await this.summarizer.summarize(afterDedup, {
            tier: 'warm',
          });
          summarized = sumResult.groups.length;
          charsSaved += sumResult.charsBefore - sumResult.charsAfter;

          if (sumResult.summaries.length > 0) {
            await this.storage.upsert(sumResult.summaries);
          }
          // Delete the original entries that were summarized (not the preserved top-N)
          const summarizedSourceIds = sumResult.groups.flatMap((g) => g.sourceIds);
          if (summarizedSourceIds.length > 0) {
            // Delete only entries that are NOT in the preserved topN
            // (The summarizer already kept them, but we still need to remove the originals)
            await this.storage.delete(summarizedSourceIds);
          }
          this.emit({ type: 'summarization-completed', result: sumResult });
        } catch (err) {
          errors.push(`summarizer: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // --- 3. Tier migration ---
      if (this.config.job.runTierMigration) {
        try {
          const tierResult = await this.tierManager.migrate(this.storage);
          promoted = tierResult.promoted.length;
          demoted = tierResult.demoted.length;
          pruned = tierResult.pruned.length;
          this.emit({ type: 'tier-migration-completed', result: tierResult });
        } catch (err) {
          errors.push(`tier-migration: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`general: ${err instanceof Error ? err.message : String(err)}`);
    }

    const finishedAt = Date.now();
    const durationMs = finishedAt - startedAt;
    const run: CompressionJobRun = {
      runId,
      startedAt,
      finishedAt,
      durationMs,
      deduped,
      summarized,
      promoted,
      demoted,
      pruned,
      charsSaved,
      errors,
    };

    this.lastRun = run;
    this.stats.totalRuns++;
    this.stats.totalDeduped += deduped;
    this.stats.totalSummarized += summarized;
    this.stats.totalPromoted += promoted;
    this.stats.totalDemoted += demoted;
    this.stats.totalPruned += pruned;
    this.stats.totalCharsSaved += charsSaved;
    this.stats.durationSamples.push(durationMs);
    if (this.stats.durationSamples.length > 100) this.stats.durationSamples.shift();

    this.emit({ type: 'job-completed', run });
    this.isRunning = false;
    return run;
  }

  // --- Manual ops (independent of periodic run) -------------------------

  async runDedupOnly(entries: CompressableMemoryEntry[]) {
    const result = await this.dedup.deduplicate(entries);
    this.emit({ type: 'dedup-completed', result });
    return result;
  }

  async runSummarizeOnly(entries: CompressableMemoryEntry[], tier: 'warm' | 'cold' = 'warm') {
    const result = await this.summarizer.summarize(entries, { tier });
    this.emit({ type: 'summarization-completed', result });
    return result;
  }

  async runTierMigration() {
    const result = await this.tierManager.migrate(this.storage);
    this.emit({ type: 'tier-migration-completed', result });
    return result;
  }

  // --- Stats & events ----------------------------------------------------

  async getStats(): Promise<CompressionStats> {
    const counts = await this.storage.countByTier().catch(() => ({
      hot: 0,
      warm: 0,
      cold: 0,
    }));
    const avgDur =
      this.stats.durationSamples.length > 0
        ? this.stats.durationSamples.reduce((a, b) => a + b, 0) / this.stats.durationSamples.length
        : 0;
    return {
      totalRuns: this.stats.totalRuns,
      totalDeduped: this.stats.totalDeduped,
      totalSummarized: this.stats.totalSummarized,
      totalPromoted: this.stats.totalPromoted,
      totalDemoted: this.stats.totalDemoted,
      totalPruned: this.stats.totalPruned,
      totalCharsSaved: this.stats.totalCharsSaved,
      averageDurationMs: avgDur,
      lastRunAt: this.lastRun?.finishedAt ?? null,
      lastRunStats: this.lastRun,
      currentTierCounts: counts,
    };
  }

  on(listener: CompressionEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: CompressionEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* swallow */
      }
    }
  }

  // --- Shutdown ----------------------------------------------------------

  async destroy(): Promise<void> {
    this.stop();
    this.listeners = [];
    this.dedup.clear();
  }

  private emptyRun(): CompressionJobRun {
    const now = Date.now();
    return {
      runId: `run_${this.nextRunId - 1}`,
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      deduped: 0,
      summarized: 0,
      promoted: 0,
      demoted: 0,
      pruned: 0,
      charsSaved: 0,
      errors: [],
    };
  }
}
