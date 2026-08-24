export interface KnowledgeDocument {
  /** Unique document ID */
  id: string;
  /** Document content (text) */
  content: string;
  /** Source path or URL */
  source: string;
  /** Document type */
  type: 'file' | 'url' | 'text' | 'database';
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** When the document was ingested */
  ingestedAt: number;
  /** Content hash for deduplication */
  hash?: string;
}

export interface KnowledgeChunk {
  /** Chunk ID */
  id: string;
  /** Parent document ID */
  documentId: string;
  /** Chunk text content */
  content: string;
  /** Chunk index within document */
  index: number;
  /** Start character offset in original document */
  startOffset: number;
  /** End character offset */
  endOffset: number;
  /** Embedding vector (if available) */
  embedding?: number[];
  /** Metadata inherited from document */
  metadata?: Record<string, unknown>;
}

export interface KnowledgeSource {
  /** Source ID */
  id: string;
  /** Source name */
  name: string;
  /** Source type */
  type: KnowledgeDocument['type'];
  /** How to load content from this source */
  loader: () => Promise<string>;
  /** Refresh interval in ms (0 = no auto-refresh) */
  refreshInterval?: number;
  /** Last refreshed timestamp */
  lastRefreshed?: number;
}

export interface IngestOptions {
  /** Chunk size in characters */
  chunkSize?: number;
  /** Overlap between chunks in characters */
  chunkOverlap?: number;
  /** Generate embeddings (requires embedding function) */
  generateEmbeddings?: boolean;
  /** Custom metadata to add to all chunks */
  metadata?: Record<string, unknown>;
  /** Skip duplicate content (by hash) */
  deduplicate?: boolean;
}

export interface SearchOptions {
  /** Max results to return */
  limit?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Filter by document type */
  type?: KnowledgeDocument['type'];
  /** Filter by metadata */
  metadata?: Record<string, unknown>;
  /** Use semantic search (requires embeddings) */
  semantic?: boolean;
}

export interface KnowledgeSearchResult {
  chunk: KnowledgeChunk;
  score: number;
  document: KnowledgeDocument;
}

export type EmbeddingFunction = (text: string) => Promise<number[]>;

export interface GraphNode {
  id: string;
  label: string; // e.g., 'Person', 'Organization', 'Concept'
  name: string;
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string; // e.g., 'WORKS_FOR', 'DEPENDS_ON'
  weight?: number;
  properties?: Record<string, unknown>;
}

export interface EntityExtractionProvider {
  /** Given a text chunk, extract entities and relations */
  extract(text: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
}
