import type { KnowledgeDocument, KnowledgeChunk, KnowledgeSource, IngestOptions, SearchOptions, KnowledgeSearchResult, EmbeddingFunction } from './types.js';
/**
 * Knowledge Engine — RAG ingestion and retrieval.
 * Manages document sources, chunking, optional embedding, and search.
 */
export declare class KnowledgeEngine {
    private readonly documents;
    private readonly chunks;
    private readonly sources;
    private readonly contentHashes;
    private embeddingFn?;
    constructor(embeddingFn?: EmbeddingFunction);
    /** Set the embedding function for semantic search */
    setEmbeddingFunction(fn: EmbeddingFunction): void;
    addSource(source: KnowledgeSource): void;
    removeSource(id: string): boolean;
    listSources(): KnowledgeSource[];
    /** Ingest a document directly */
    ingestDocument(content: string, source: string, type?: KnowledgeDocument['type'], options?: IngestOptions): Promise<{
        document: KnowledgeDocument;
        chunks: KnowledgeChunk[];
    }>;
    /** Ingest from a registered source */
    ingestFromSource(sourceId: string, options?: IngestOptions): Promise<KnowledgeDocument | undefined>;
    /** Ingest from all registered sources */
    ingestAll(options?: IngestOptions): Promise<KnowledgeDocument[]>;
    /** Search knowledge chunks */
    search(query: string, options?: SearchOptions): Promise<KnowledgeSearchResult[]>;
    /** Query knowledge and format as context string for RAG injection */
    queryContext(query: string, options?: SearchOptions & {
        maxChars?: number;
    }): Promise<string>;
    getDocument(id: string): KnowledgeDocument | undefined;
    listDocuments(): KnowledgeDocument[];
    getChunks(documentId: string): KnowledgeChunk[];
    removeDocument(id: string): boolean;
    getStats(): {
        documents: number;
        chunks: number;
        sources: number;
    };
    clear(): void;
    private splitIntoChunks;
    private tokenSearch;
    private semanticSearch;
    private metadataMatches;
}
//# sourceMappingURL=knowledge.d.ts.map