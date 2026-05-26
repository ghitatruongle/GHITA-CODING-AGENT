// ==============================================================================
// GHITA CODING AGENT - Knowledge / RAG Engine
// ==============================================================================
const TOKEN_PATTERN = /[\p{L}\p{N}_-]+/gu;
function generateId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function hashContent(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString(36);
}
function tokenize(text) {
    const matches = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
    return new Set(matches.filter((t) => t.length > 1));
}
function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
/**
 * Knowledge Engine — RAG ingestion and retrieval.
 * Manages document sources, chunking, optional embedding, and search.
 */
export class KnowledgeEngine {
    documents = new Map();
    chunks = new Map();
    sources = new Map();
    contentHashes = new Set();
    embeddingFn;
    constructor(embeddingFn) {
        this.embeddingFn = embeddingFn;
    }
    /** Set the embedding function for semantic search */
    setEmbeddingFunction(fn) {
        this.embeddingFn = fn;
    }
    // --- Source Management ---
    addSource(source) {
        this.sources.set(source.id, source);
    }
    removeSource(id) {
        return this.sources.delete(id);
    }
    listSources() {
        return [...this.sources.values()];
    }
    // --- Ingestion ---
    /** Ingest a document directly */
    async ingestDocument(content, source, type = 'text', options = {}) {
        const chunkSize = options.chunkSize ?? 500;
        const chunkOverlap = options.chunkOverlap ?? 50;
        const deduplicate = options.deduplicate ?? true;
        const hash = hashContent(content);
        if (deduplicate && this.contentHashes.has(hash)) {
            // Return existing document
            const existing = [...this.documents.values()].find((d) => d.hash === hash);
            if (existing) {
                const existingChunks = [...this.chunks.values()].filter((c) => c.documentId === existing.id);
                return { document: existing, chunks: existingChunks };
            }
        }
        const docId = generateId('doc');
        const document = {
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
        const chunks = [];
        for (let i = 0; i < rawChunks.length; i++) {
            const chunk = {
                id: generateId('chk'),
                documentId: docId,
                content: rawChunks[i].text,
                index: i,
                startOffset: rawChunks[i].start,
                endOffset: rawChunks[i].end,
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
    async ingestFromSource(sourceId, options) {
        const source = this.sources.get(sourceId);
        if (!source)
            return undefined;
        const content = await source.loader();
        const { document } = await this.ingestDocument(content, source.name, source.type, options);
        source.lastRefreshed = Date.now();
        return document;
    }
    /** Ingest from all registered sources */
    async ingestAll(options) {
        const docs = [];
        for (const source of this.sources.values()) {
            const doc = await this.ingestFromSource(source.id, options);
            if (doc)
                docs.push(doc);
        }
        return docs;
    }
    // --- Search ---
    /** Search knowledge chunks */
    async search(query, options = {}) {
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
    async queryContext(query, options = {}) {
        const maxChars = options.maxChars ?? 3000;
        const results = await this.search(query, options);
        if (results.length === 0)
            return '';
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
    getDocument(id) {
        return this.documents.get(id);
    }
    listDocuments() {
        return [...this.documents.values()];
    }
    getChunks(documentId) {
        return [...this.chunks.values()].filter((c) => c.documentId === documentId);
    }
    removeDocument(id) {
        const doc = this.documents.get(id);
        if (!doc)
            return false;
        this.documents.delete(id);
        if (doc.hash)
            this.contentHashes.delete(doc.hash);
        // Remove associated chunks
        for (const [chunkId, chunk] of this.chunks.entries()) {
            if (chunk.documentId === id)
                this.chunks.delete(chunkId);
        }
        return true;
    }
    getStats() {
        return {
            documents: this.documents.size,
            chunks: this.chunks.size,
            sources: this.sources.size,
        };
    }
    clear() {
        this.documents.clear();
        this.chunks.clear();
        this.contentHashes.clear();
    }
    // --- Private Helpers ---
    splitIntoChunks(text, chunkSize, overlap) {
        const chunks = [];
        let start = 0;
        while (start < text.length) {
            const end = Math.min(start + chunkSize, text.length);
            chunks.push({ text: text.slice(start, end), start, end });
            start = end - overlap;
            if (start >= text.length)
                break;
        }
        return chunks;
    }
    async tokenSearch(query, limit, minScore, options) {
        const queryTokens = tokenize(query);
        if (queryTokens.size === 0)
            return [];
        const results = [];
        for (const chunk of this.chunks.values()) {
            const doc = this.documents.get(chunk.documentId);
            if (!doc)
                continue;
            if (options.type && doc.type !== options.type)
                continue;
            if (options.metadata && !this.metadataMatches(doc.metadata, options.metadata))
                continue;
            const chunkTokens = tokenize(chunk.content);
            let matches = 0;
            for (const token of queryTokens) {
                if (chunkTokens.has(token))
                    matches++;
            }
            const score = matches / queryTokens.size;
            if (score >= minScore) {
                results.push({ chunk, score, document: doc });
            }
        }
        return results.sort((a, b) => b.score - a.score).slice(0, limit);
    }
    async semanticSearch(query, limit, minScore, options) {
        const queryEmbedding = await this.embeddingFn(query);
        const results = [];
        for (const chunk of this.chunks.values()) {
            if (!chunk.embedding)
                continue;
            const doc = this.documents.get(chunk.documentId);
            if (!doc)
                continue;
            if (options.type && doc.type !== options.type)
                continue;
            const score = cosineSimilarity(queryEmbedding, chunk.embedding);
            if (score >= minScore) {
                results.push({ chunk, score, document: doc });
            }
        }
        return results.sort((a, b) => b.score - a.score).slice(0, limit);
    }
    metadataMatches(entryMeta, expected) {
        if (!entryMeta)
            return false;
        for (const [key, value] of Object.entries(expected)) {
            if (entryMeta[key] !== value)
                return false;
        }
        return true;
    }
}
//# sourceMappingURL=knowledge.js.map