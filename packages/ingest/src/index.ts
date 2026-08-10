// ==============================================================================
// GHITA CODING AGENT - @ghita/ingest public entry
// ==============================================================================

export { INGEST_VERSION } from './types.js';
export type {
  SourceType,
  IngestDocument,
  Chunk,
  ChunkingOptions,
  LoadResult,
  IndexProgress,
  IndexStats,
  RetrieverResult,
  VectorProvider,
} from './types.js';

export {
  loadDocument,
  loadDirectory,
  discoverFiles,
  sourceOf,
  contentHash,
  extractDocxText,
  redactSecrets,
  isDirectory,
} from './loaders.js';
export type { PdfReader } from './loaders.js';

export {
  splitFixed,
  splitMarkdown,
  splitCode,
  splitRecursive,
  chunkDocument,
} from './splitters.js';
export type { ChunkMeta } from './splitters.js';

export { IngestIndexer, createCollectingSink } from './indexer.js';
export type { ChunkSink, IngestIndexerOptions } from './indexer.js';

export { createKnowledgeEngineSink } from './engine-sink.js';
export type { KnowledgeEngineLike, EngineSinkOptions } from './engine-sink.js';

export {
  bm25Score,
  cosineSimilarity,
  reciprocalRankFusion,
  HybridRetriever,
  parentDocumentRetrieval,
  BM25Index,
} from './retrieval.js';
export type { HybridRetrieverOptions } from './retrieval.js';

export { main as cliMain } from './cli.js';
