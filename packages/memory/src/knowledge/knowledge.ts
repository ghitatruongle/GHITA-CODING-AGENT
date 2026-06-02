// ==============================================================================
// GHITA CODING AGENT - Knowledge / RAG Engine
// ==============================================================================

import type {
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeSource,
  IngestOptions,
  SearchOptions,
  KnowledgeSearchResult,
  EmbeddingFunction,
} from './types.js';

const TOKEN_PATTERN = /[\p{L}\p{N}_-]+/gu;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function tokenize(text: string): Set<string> {
  const matches = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
  return new Set(matches.filter((t) => t.length > 1));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) * (a[i] ?? 0);
    normB += (b[i] ?? 0) * (b[i] ?? 0);
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Knowledge Engine — RAG ingestion and retrieval.
 * Manages document sources, chunking, optional embedding, and search.
 */
export class KnowledgeEngine {
  private readonly documents = new Map<string, KnowledgeDocument>();
  private readonly chunks = new Map<string, KnowledgeChunk>();
  private readonly sources = new Map<string, KnowledgeSource>();
  private readonly contentHashes = new Set<string>();
  private embeddingFn?: EmbeddingFunction;

  constructor(embeddingFn?: EmbeddingFunction) {
    this.embeddingFn = embeddingFn;
  }

  /** Set the embedding function for semantic search */
  setEmbeddingFunction(fn: EmbeddingFunction): void {
    this.embeddingFn = fn;
  }

  // --- Source Management ---

  addSource(source: KnowledgeSource): void {
    this.sources.set(source.id, source);
  }

  removeSource(id: string): boolean {
    return this.sources.delete(id);
  }

  listSources(): KnowledgeSource[] {
    return [...this.sources.values()];
  }

  // --- Ingestion ---

  /** Ingest a document directly */
  async ingestDocument(
    content: string,
    source: string,
    type: KnowledgeDocument['type'] = 'text',
    options: IngestOptions = {},
  ): Promise<{ document: KnowledgeDocument; chunks: KnowledgeChunk[] }> {
    const chunkSize = options.chunkSize ?? 500;
    const chunkOverlap = options.chunkOverlap ?? 50;
    const deduplicate = options.deduplicate ?? true;

    const hash = hashContent(content);
    if (deduplicate && this.contentHashes.has(hash)) {
      // Return existing document
      const existing = [...this.documents.values()].find((d) => d.hash === hash);
      if (existing) {
        const existingChunks = [...this.chunks.values()].filter(
          (c) => c.documentId === existing.id,
        );
        return { document: existing, chunks: existingChunks };
      }
    }

    const docId = generateId('doc');
    const document: KnowledgeDocument = {
      id: docId,
      content,
      source,
      type,
      metadata: options.metadata,
      ingestedAt: Date.now(),
      hash,
    };

    this.documents.set(docId, document);
    this.contentHashes.add(hash);

    // Chunk the content
    const rawChunks = this.splitIntoChunks(content, chunkSize, chunkOverlap);
    const chunks: KnowledgeChunk[] = [];

    for (let i = 0; i < rawChunks.length; i++) {
      const chunk: KnowledgeChunk = {
        id: generateId('chk'),
        documentId: docId,
content: rawChunks[i]?.text ?? '',
      index: i,
      startOffset: rawChunks[i]?.start ?? 0,
      endOffset: rawChunks[i]?.end ?? 0,
        metadata: options.metadata,
      };

      // Generate embedding if function available
      if (options.generateEmbeddings && this.embeddingFn) {
        chunk.embedding = await this.embeddingFn(chunk.content);
      }

      this.chunks.set(chunk.id, chunk);
      chunks.push(chunk);
    }

    return { document, chunks };
  }

  /** Ingest from a registered source */
  async ingestFromSource(sourceId: string, options?: IngestOptions): Promise<KnowledgeDocument | undefined> {
    const source = this.sources.get(sourceId);
    if (!source) return undefined;

    const content = await source.loader();
    const { document } = await this.ingestDocument(content, source.name, source.type, options);
    source.lastRefreshed = Date.now();
    return document;
  }

  /** Ingest from all registered sources */
  async ingestAll(options?: IngestOptions): Promise<KnowledgeDocument[]> {
    const docs: KnowledgeDocument[] = [];
    for (const source of this.sources.values()) {
      const doc = await this.ingestFromSource(source.id, options);
      if (doc) docs.push(doc);
    }
    return docs;
  }

  // --- Search ---

  /** Search knowledge chunks */
  async search(query: string, options: SearchOptions = {}): Promise<KnowledgeSearchResult[]> {
    const limit = options.limit ?? 5;
    const minScore = options.minScore ?? 0.1;

    // Semantic search with embeddings
    if (options.semantic && this.embeddingFn) {
      return this.semanticSearch(query, limit, minScore, options);
    }

    // Token-based search (default)
    return this.tokenSearch(query, limit, minScore, options);
  }

  /** Query knowledge and format as context string for RAG injection */
  async queryContext(query: string, options: SearchOptions & { maxChars?: number } = {}): Promise<string> {
    const maxChars = options.maxChars ?? 3000;
    const results = await this.search(query, options);
    if (results.length === 0) return '';

    const lines = ['=== RELEVANT KNOWLEDGE ==='];
    for (const result of results) {
      const source = result.document.source;
      lines.push(`\n[Source: ${source}]`);
      lines.push(result.chunk.content);
    }

    const context = lines.join('\n');
    return context.length > maxChars ? `${context.slice(0, maxChars)}...` : context;
  }

  // --- Document Management ---

  getDocument(id: string): KnowledgeDocument | undefined {
    return this.documents.get(id);
  }

  listDocuments(): KnowledgeDocument[] {
    return [...this.documents.values()];
  }

  getChunks(documentId: string): KnowledgeChunk[] {
    return [...this.chunks.values()].filter((c) => c.documentId === documentId);
  }

  removeDocument(id: string): boolean {
    const doc = this.documents.get(id);
    if (!doc) return false;
    this.documents.delete(id);
    if (doc.hash) this.contentHashes.delete(doc.hash);
    // Remove associated chunks
    for (const [chunkId, chunk] of this.chunks.entries()) {
      if (chunk.documentId === id) this.chunks.delete(chunkId);
    }
    return true;
  }

  getStats(): { documents: number; chunks: number; sources: number } {
    return {
      documents: this.documents.size,
      chunks: this.chunks.size,
      sources: this.sources.size,
    };
  }

  clear(): void {
    this.documents.clear();
    this.chunks.clear();
    this.contentHashes.clear();
  }

  // --- Private Helpers ---

  private splitIntoChunks(
    text: string,
    chunkSize: number,
    overlap: number,
  ): Array<{ text: string; start: number; end: number }> {
    const chunks: Array<{ text: string; start: number; end: number }> = [];
    if (overlap >= chunkSize) {
      throw new Error('overlap must be less than chunkSize');
    }
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push({ text: text.slice(start, end), start, end });
      start = end - overlap;
      if (start >= text.length) break;
    }

    return chunks;
  }

  private async tokenSearch(
    query: string,
    limit: number,
    minScore: number,
    options: SearchOptions,
  ): Promise<KnowledgeSearchResult[]> {
    const queryTokens = tokenize(query);
    if (queryTokens.size === 0) return [];

    const results: KnowledgeSearchResult[] = [];

    for (const chunk of this.chunks.values()) {
      const doc = this.documents.get(chunk.documentId);
      if (!doc) continue;
      if (options.type && doc.type !== options.type) continue;
      if (options.metadata && !this.metadataMatches(doc.metadata, options.metadata)) continue;

      const chunkTokens = tokenize(chunk.content);
      let matches = 0;
      for (const token of queryTokens) {
        if (chunkTokens.has(token)) matches++;
      }
      const score = matches / queryTokens.size;
      if (score >= minScore) {
        results.push({ chunk, score, document: doc });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private async semanticSearch(
    query: string,
    limit: number,
    minScore: number,
    options: SearchOptions,
  ): Promise<KnowledgeSearchResult[]> {
    const queryEmbedding = await (this.embeddingFn as EmbeddingFunction)(query);
    const results: KnowledgeSearchResult[] = [];

    for (const chunk of this.chunks.values()) {
      if (!chunk.embedding) continue;
      const doc = this.documents.get(chunk.documentId);
      if (!doc) continue;
      if (options.type && doc.type !== options.type) continue;

      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= minScore) {
        results.push({ chunk, score, document: doc });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private metadataMatches(
    entryMeta: Record<string, unknown> | undefined,
    expected: Record<string, unknown>,
  ): boolean {
    if (!entryMeta) return false;
    for (const [key, value] of Object.entries(expected)) {
      if (entryMeta[key] !== value) return false;
    }
    return true;
  }
}
