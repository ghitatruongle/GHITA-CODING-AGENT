// ==============================================================================
// GHITA CODING AGENT - @ghita/ingest sink → memory KnowledgeEngine (P67)
// ==============================================================================
// Adapter that upserts ingested documents into @ghita/memory KnowledgeEngine
// (hash-dedup nằm sẵn trong engine.ingestDocument). Structural typing keeps
// this package decoupled from memory internals.
// ==============================================================================

import type { ChunkSink } from './indexer.js';
import type { Chunk, IngestDocument } from './types.js';

/** Structural surface of KnowledgeEngine.ingestDocument. */
export interface KnowledgeEngineLike {
  ingestDocument(
    content: string,
    source: string,
    type?: 'file' | 'url' | 'text' | 'database',
    options?: {
      chunkSize?: number;
      chunkOverlap?: number;
      deduplicate?: boolean;
      generateEmbeddings?: boolean;
      metadata?: Record<string, unknown>;
    },
  ): Promise<unknown>;
  getStats?: () => { documents: number; chunks: number; sources: number };
}

export interface EngineSinkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  generateEmbeddings?: boolean;
  /** Map IngestDocument source types onto KnowledgeDocument types. */
  typeFor?: (doc: IngestDocument) => 'file' | 'url' | 'text' | 'database';
}

const DEFAULT_TYPE: NonNullable<EngineSinkOptions['typeFor']> = () => 'file';

/**
 * Create a ChunkSink that upserts each ingested document into the memory
 * KnowledgeEngine. Chunks produced by the ingest pipeline are carried in the
 * document metadata (count), while the engine performs its own chunking +
 * content-hash dedup (incremental upsert).
 */
export function createKnowledgeEngineSink(
  engine: KnowledgeEngineLike,
  options: EngineSinkOptions = {},
): ChunkSink {
  const typeFor = options.typeFor ?? DEFAULT_TYPE;
  return async (chunks: Chunk[], doc: IngestDocument) => {
    await engine.ingestDocument(doc.content, doc.path, typeFor(doc), {
      chunkSize: options.chunkSize,
      chunkOverlap: options.chunkOverlap,
      deduplicate: true,
      generateEmbeddings: options.generateEmbeddings,
      metadata: {
        ...doc.meta,
        sourceType: doc.source,
        bytes: doc.bytes,
        ingestChunks: chunks.length,
        hash: doc.hash,
      },
    });
  };
}
