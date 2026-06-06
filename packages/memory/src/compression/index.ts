// ==============================================================================
// GHITA CODING AGENT - Memory Compression Module Barrel (Phase 30)
// ==============================================================================

// --- Types ---
export type {
  MemoryTier,
  CompressableMemoryEntry,
  SummarizerConfig,
  SummaryGroup,
  SummarizationResult,
  EmbeddingDedupConfig,
  DedupResult,
  TierMigrationConfig,
  TierMigrationResult,
  CompressionJobConfig,
  CompressionJobRun,
  CompressionConfig,
  CompressionStats,
  CompressionEvent,
  CompressionEventListener,
  EmbeddingProvider,
  MemoryStorageAdapter,
} from './types.js';
export { DEFAULT_COMPRESSION_CONFIG } from './types.js';

// --- Engines ---
export { MemorySummarizer } from './summarizer.js';
export { EmbeddingDedup } from './embedding-dedup.js';
export { TierManager } from './tier-manager.js';
export { BackgroundCompressionJob } from './background-job.js';

// --- Facade ---
export { MemoryCompression } from './compression.js';
