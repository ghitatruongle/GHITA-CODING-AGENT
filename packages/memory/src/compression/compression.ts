// High-level facade combining summarizer + dedup + tier manager.
// Exposed as `MemoryCompression` for simple use; the background job is the
// recommended way to run it in production.

import type {
  CompressionConfig,
  CompressionStats,
  CompressableMemoryEntry,
  DedupResult,
  EmbeddingProvider,
  MemoryStorageAdapter,
  SummarizationResult,
  TierMigrationResult,
  CompressionEventListener,
} from './types.js';
import { MemorySummarizer } from './summarizer.js';
import { EmbeddingDedup } from './embedding-dedup.js';
import { TierManager } from './tier-manager.js';
import { BackgroundCompressionJob } from './background-job.js';

// MemoryCompression (facade)

export class MemoryCompression {
  private storage: MemoryStorageAdapter;
  private summarizer: MemorySummarizer;
  private dedup: EmbeddingDedup;
  private tierManager: TierManager;
  private backgroundJob: BackgroundCompressionJob;
  private config: CompressionConfig;

  constructor(
    storage: MemoryStorageAdapter,
    embedder?: EmbeddingProvider,
    config?: CompressionConfig,
  ) {
    this.storage = storage;
    this.config = config ?? {};
    this.summarizer = new MemorySummarizer(this.config.summarizer, embedder);
    this.dedup = new EmbeddingDedup(this.config.dedup, embedder);
    this.tierManager = new TierManager(this.config.tierMigration);
    this.backgroundJob = new BackgroundCompressionJob(storage, this.config);
  }

  /** Deduplicate entries. */
  async deduplicate(entries: CompressableMemoryEntry[]): Promise<DedupResult> {
    return this.dedup.deduplicate(entries);
  }

  /** Summarize a list of entries. */
  async summarize(
    entries: CompressableMemoryEntry[],
    options?: { tier?: 'warm' | 'cold' },
  ): Promise<SummarizationResult> {
    return this.summarizer.summarize(entries, options);
  }

  /** Run a tier migration cycle. */
  async migrateTiers(): Promise<TierMigrationResult> {
    return this.tierManager.migrate(this.storage);
  }

  /** Run a full compression cycle (dedup + summarize + migrate). */
  async runFullCycle(): Promise<{
    dedup: DedupResult;
    summary: SummarizationResult;
    migration: TierMigrationResult;
  }> {
    const all = await this.storage.list();
    const dedup = await this.dedup.deduplicate(all);
    if (dedup.removed.length > 0) {
      await this.storage.delete(dedup.removed);
    }
    const afterDedup = await this.storage.list();
    const summary = await this.summarizer.summarize(afterDedup, { tier: 'warm' });
    if (summary.summaries.length > 0) {
      await this.storage.upsert(summary.summaries);
    }
    const sourceIds = summary.groups.flatMap((g) => g.sourceIds);
    if (sourceIds.length > 0) {
      await this.storage.delete(sourceIds);
    }
    const migration = await this.tierManager.migrate(this.storage);
    return { dedup, summary, migration };
  }

  /** Start the background job. */
  startBackground(): void {
    this.backgroundJob.start();
  }

  /** Stop the background job. */
  stopBackground(): void {
    this.backgroundJob.stop();
  }

  /** Run a single background cycle on demand. */
  runBackgroundOnce() {
    return this.backgroundJob.runOnce();
  }

  /** Subscribe to compression events. */
  on(listener: CompressionEventListener): () => void {
    return this.backgroundJob.on(listener);
  }

  /** Get aggregated stats. */
  getStats(): Promise<CompressionStats> {
    return this.backgroundJob.getStats();
  }

  /** Access individual engines. */
  get engines() {
    return {
      summarizer: this.summarizer,
      dedup: this.dedup,
      tierManager: this.tierManager,
      backgroundJob: this.backgroundJob,
    };
  }

  /** Shutdown everything. */
  async destroy(): Promise<void> {
    this.backgroundJob.stop();
    this.dedup.clear();
  }
}
