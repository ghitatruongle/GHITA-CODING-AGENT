// Incremental indexer: discovers → loads → chunks with hash-dedup, optional
// secret redaction (P73), progress + abort support. Output feeds the memory
// KnowledgeEngine via a pluggable sink.

import {
  isDirectory,
  loadDirectory,
  loadDocument,
  redactSecrets,
  type PdfReader,
} from './loaders.js';
import { chunkDocument, type ChunkMeta } from './splitters.js';
import type { Chunk, IndexProgress, IndexStats, IngestDocument } from './types.js';

export interface ChunkSink {
  (chunks: Chunk[], doc: IngestDocument): Promise<void>;
}

export interface IngestIndexerOptions {
  /** Redact secrets before chunking (P73). */
  redact?: boolean;
  /** Re-index files whose hash changed (incremental). */
  knownHashes?: Map<string, string>;
  onProgress?: (progress: IndexProgress) => void;
  signal?: AbortSignal;
  readPdf?: PdfReader;
  chunkOptions?: { chunkSize?: number; overlap?: number };
}

export class IngestIndexer {
  private readonly seenHashes = new Set<string>();
  private skipped = 0;

  constructor(
    private readonly sink: ChunkSink,
    private readonly options: IngestIndexerOptions = {},
  ) {}

  /** Index one file (or directory). Returns stats. */
  async index(target: string): Promise<IndexStats> {
    const started = Date.now();
    this.options.onProgress?.({ phase: 'discover', processed: 0, total: 1, current: target });
    this.abortIfNeeded();

    let docs: IngestDocument[];
    let skipped: string[] = [];
    if (isDirectory(target)) {
      const loaded = await loadDirectory(target, { readPdf: this.options.readPdf });
      docs = loaded.documents;
      skipped = loaded.skipped;
    } else {
      const loaded = await loadDocument(target, { readPdf: this.options.readPdf });
      docs = loaded.document ? [loaded.document] : [];
      if (loaded.skipped) skipped = [loaded.skipped];
    }
    this.skipped = skipped.length;

    let totalChunks = 0;
    let deduplicated = 0;
    for (let i = 0; i < docs.length; i++) {
      this.abortIfNeeded();
      const doc = docs[i];
      if (doc === undefined) continue;
      this.options.onProgress?.({
        phase: 'load',
        processed: i + 1,
        total: docs.length,
        current: doc.path,
      });

      // Incremental: skip files whose hash is unchanged.
      if (this.options.knownHashes?.get(doc.path) === doc.hash) {
        deduplicated += 1;
        continue;
      }
      if (this.seenHashes.has(doc.hash)) {
        deduplicated += 1;
        continue;
      }
      this.seenHashes.add(doc.hash);

      const content = this.options.redact ? redactSecrets(doc.content) : doc.content;
      const normalized: IngestDocument = { ...doc, content };
      const meta: ChunkMeta = {
        language: doc.source === 'code' ? fileExtension(doc.path) : undefined,
      };
      const chunks = chunkDocument(normalized, this.options.chunkOptions, meta);
      await this.sink(chunks, normalized);
      totalChunks += chunks.length;
    }

    this.options.onProgress?.({ phase: 'done', processed: docs.length, total: docs.length });
    return {
      docs: docs.length,
      chunks: totalChunks,
      deduplicated,
      skipped: this.skipped,
      durationMs: Date.now() - started,
    };
  }

  private abortIfNeeded(): void {
    if (this.options.signal?.aborted) {
      throw new Error('ingest aborted');
    }
  }
}

function fileExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? (parts[parts.length - 1] ?? 'txt') : 'txt';
}

/** Default sink: collect chunks in memory (useful for tests/CLI). */
export function createCollectingSink(): { sink: ChunkSink; chunks: Chunk[] } {
  const chunks: Chunk[] = [];
  return {
    chunks,
    sink: async (incoming) => {
      chunks.push(...incoming);
    },
  };
}
