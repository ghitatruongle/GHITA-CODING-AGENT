// ==============================================================================
// GHITA CODING AGENT - Memory Compression Types (Phase 30)
// Summarize old memories, embedding-based dedup, hot/warm/cold tier migration,
// and background compaction jobs.
// ==============================================================================

// ---------------------------------------------------------------------------
// Memory Tiers
// ---------------------------------------------------------------------------

/**
 * - 'hot':   in-process, immediate access, no summarization
 * - 'warm':  serialized, recent summaries, light compression
 * - 'cold':  long-term storage, heavily compressed/aggregated summaries
 */
export type MemoryTier = 'hot' | 'warm' | 'cold';

// ---------------------------------------------------------------------------
// Compressable entry (subset of MemoryEntry, with extra compression metadata)
// ---------------------------------------------------------------------------

export interface CompressableMemoryEntry {
  id: string;
  type: 'conversation' | 'task' | 'note' | 'preference' | 'fact' | string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  /** Current tier */
  tier: MemoryTier;
  /** Access count (for tier migration decisions) */
  accessCount: number;
  /** Last accessed timestamp */
  lastAccessedAt: number;
  /** Importance score (0-1) */
  importance: number;
  /** Optional embedding vector (for semantic dedup) */
  embedding?: number[];
  /** Source session ID */
  sessionId?: string;
  /** Tags */
  tags?: string[];
  /** True if entry was created by summarization (vs original) */
  isSummary?: boolean;
  /** IDs of original entries this summary represents */
  summarizedFrom?: string[];
}

// ---------------------------------------------------------------------------
// Summarization
// ---------------------------------------------------------------------------

export interface SummarizerConfig {
  /** Target max length of a summary (chars, default: 300) */
  maxSummaryLength: number;
  /** Minimum number of entries to trigger a summary (default: 3) */
  minGroupSize: number;
  /** Minimum importance to keep an entry unsummarized (default: 0.6) */
  importanceThreshold: number;
  /** When summarizing, keep this many of the most important entries verbatim */
  preserveTopN: number;
}

export interface SummaryGroup {
  /** IDs of the entries summarized */
  sourceIds: string[];
  /** The generated summary text */
  summary: string;
  /** Number of source entries compressed into this summary */
  sourceCount: number;
  /** Total chars saved by the summary */
  charsSaved: number;
  /** Compression ratio (0-1; 0.7 = 70% reduction) */
  compressionRatio: number;
  /** Span of time covered */
  startTime: number;
  endTime: number;
  /** Key topics extracted */
  keyTopics: string[];
}

export interface SummarizationResult {
  /** Groups of entries that were summarized */
  groups: SummaryGroup[];
  /** Total entries before */
  before: number;
  /** Total entries after */
  after: number;
  /** Total characters before */
  charsBefore: number;
  /** Total characters after */
  charsAfter: number;
  /** Overall compression ratio (0-1) */
  compressionRatio: number;
  /** New summary entries (tier: 'warm' or 'cold') */
  summaries: CompressableMemoryEntry[];
}

// ---------------------------------------------------------------------------
// Embedding-based Dedup
// ---------------------------------------------------------------------------

export interface EmbeddingDedupConfig {
  /** Cosine similarity threshold (0-1) for dedup (default: 0.92) */
  similarityThreshold: number;
  /** Max number of embeddings to keep in index (default: 50_000) */
  maxIndexSize: number;
  /** When merging duplicates, keep N most recent (default: 1) */
  keepTopN: number;
  /** Recompute embedding on access (default: false) */
  refreshOnAccess: boolean;
}

export interface DedupResult {
  /** IDs of entries that were removed (duplicates) */
  removed: string[];
  /** IDs of entries that survived */
  kept: string[];
  /** Pairs of (keptId, removedId) showing the dedup mapping */
  pairs: Array<{ kept: string; removed: string; similarity: number }>;
  /** Total characters saved */
  charsSaved: number;
}

// ---------------------------------------------------------------------------
// Tier migration
// ---------------------------------------------------------------------------

export interface TierMigrationConfig {
  /** Hot tier max size (entries) before demoting to warm (default: 1000) */
  hotMaxSize: number;
  /** Warm tier max size (entries) before demoting to cold (default: 10_000) */
  warmMaxSize: number;
  /** Age in ms to consider an entry for cold demotion (default: 30 days) */
  coldAgeMs: number;
  /** Min access count to keep an entry in hot tier (default: 2) */
  hotMinAccess: number;
  /** Min access count to keep an entry in warm tier (default: 1) */
  warmMinAccess: number;
}

export interface TierMigrationResult {
  /** Entries promoted (cold→warm or warm→hot) */
  promoted: CompressableMemoryEntry[];
  /** Entries demoted (hot→warm or warm→cold) */
  demoted: CompressableMemoryEntry[];
  /** Entries pruned entirely (e.g. importance too low) */
  pruned: CompressableMemoryEntry[];
  /** New tier counts */
  counts: { hot: number; warm: number; cold: number };
}

// ---------------------------------------------------------------------------
// Background Job
// ---------------------------------------------------------------------------

export interface CompressionJobConfig {
  /** Whether to enable the background job (default: true) */
  enabled: boolean;
  /** Run interval in ms (default: 1 hour) */
  intervalMs: number;
  /** Max entries to process per run (default: 1000) */
  maxEntriesPerRun: number;
  /** Run dedup before summarization (default: true) */
  runDedup: boolean;
  /** Run summarization (default: true) */
  runSummarization: boolean;
  /** Run tier migration (default: true) */
  runTierMigration: boolean;
}

export interface CompressionJobRun {
  runId: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  /** Stats from this run */
  deduped: number;
  summarized: number;
  promoted: number;
  demoted: number;
  pruned: number;
  charsSaved: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Combined Compression Config
// ---------------------------------------------------------------------------

export interface CompressionConfig {
  summarizer?: Partial<SummarizerConfig>;
  dedup?: Partial<EmbeddingDedupConfig>;
  tierMigration?: Partial<TierMigrationConfig>;
  job?: Partial<CompressionJobConfig>;
}

export const DEFAULT_COMPRESSION_CONFIG: Required<CompressionConfig> = {
  summarizer: {
    maxSummaryLength: 300,
    minGroupSize: 3,
    importanceThreshold: 0.6,
    preserveTopN: 2,
  },
  dedup: {
    similarityThreshold: 0.92,
    maxIndexSize: 50_000,
    keepTopN: 1,
    refreshOnAccess: false,
  },
  tierMigration: {
    hotMaxSize: 1000,
    warmMaxSize: 10_000,
    coldAgeMs: 30 * 24 * 60 * 60 * 1000,
    hotMinAccess: 2,
    warmMinAccess: 1,
  },
  job: {
    enabled: true,
    intervalMs: 60 * 60 * 1000,
    maxEntriesPerRun: 1000,
    runDedup: true,
    runSummarization: true,
    runTierMigration: true,
  },
};

// ---------------------------------------------------------------------------
// Embedding provider interface
// ---------------------------------------------------------------------------

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  /** Optional batch embedding for performance. */
  embedBatch?(texts: string[]): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Storage adapter (read/write the memory store)
// ---------------------------------------------------------------------------

export interface MemoryStorageAdapter {
  /** List all entries (optionally filtered by tier) */
  list(filter?: { tier?: MemoryTier; type?: string; limit?: number }): Promise<CompressableMemoryEntry[]>;
  /** Get a single entry */
  get(id: string): Promise<CompressableMemoryEntry | null>;
  /** Insert or update entries */
  upsert(entries: CompressableMemoryEntry[]): Promise<void>;
  /** Delete entries by id */
  delete(ids: string[]): Promise<void>;
  /** Count entries by tier */
  countByTier(): Promise<{ hot: number; warm: number; cold: number }>;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type CompressionEvent =
  | { type: 'dedup-completed'; result: DedupResult }
  | { type: 'summarization-completed'; result: SummarizationResult }
  | { type: 'tier-migration-completed'; result: TierMigrationResult }
  | { type: 'job-started'; runId: string }
  | { type: 'job-completed'; run: CompressionJobRun }
  | { type: 'job-failed'; runId: string; error: Error };

export type CompressionEventListener = (event: CompressionEvent) => void;

// ---------------------------------------------------------------------------
// Aggregated stats
// ---------------------------------------------------------------------------

export interface CompressionStats {
  totalRuns: number;
  totalDeduped: number;
  totalSummarized: number;
  totalPromoted: number;
  totalDemoted: number;
  totalPruned: number;
  totalCharsSaved: number;
  averageDurationMs: number;
  lastRunAt: number | null;
  lastRunStats: CompressionJobRun | null;
  currentTierCounts: { hot: number; warm: number; cold: number };
}
