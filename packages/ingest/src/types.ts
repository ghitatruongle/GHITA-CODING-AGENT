// ==============================================================================
// GHITA CODING AGENT - @ghita/ingest shared types
// ==============================================================================

export type SourceType = 'text' | 'markdown' | 'json' | 'csv' | 'pdf' | 'docx' | 'code' | 'unknown';

export interface IngestDocument {
  /** Absolute or workspace-relative path. */
  path: string;
  source: SourceType;
  content: string;
  /** Optional metadata (e.g. title, page). */
  meta?: Record<string, unknown>;
  /** Content hash for dedup. */
  hash: string;
  bytes: number;
}

export interface Chunk {
  id: string;
  docPath: string;
  index: number;
  text: string;
  /** Token-ish estimate (chars / 4). */
  tokenEstimate: number;
  meta?: Record<string, unknown>;
}

export interface ChunkingOptions {
  chunkSize?: number;
  overlap?: number;
}

export interface LoadResult {
  document?: IngestDocument;
  skipped?: string;
}

export interface IndexProgress {
  phase: 'discover' | 'load' | 'chunk' | 'done';
  processed: number;
  total: number;
  current?: string;
}

export interface IndexStats {
  docs: number;
  chunks: number;
  deduplicated: number;
  skipped: number;
  durationMs: number;
}

export interface RetrieverResult {
  chunkId: string;
  docPath: string;
  text: string;
  score: number;
  source: 'bm25' | 'vector' | 'hybrid' | 'mmr';
}

export interface VectorProvider {
  embed(text: string): Promise<number[]>;
}

export const INGEST_VERSION = '1.1.0';
