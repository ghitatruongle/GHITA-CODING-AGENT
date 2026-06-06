// ==============================================================================
// GHITA CODING AGENT - Semantic Deduplication via Cosine Similarity (Phase 26)
// ==============================================================================

import type { SemanticDedupConfig, EmbeddingProvider } from './types.js';

const DEFAULT_CONFIG: SemanticDedupConfig = {
  similarityThreshold: 0.92,
  embeddingDimensions: 1536,
  maxEmbeddings: 10_000,
};

interface SemanticEntry {
  key: string;
  embedding: number[];
  createdAt: number;
}

/**
 * Semantic deduplication engine.
 * Uses cosine similarity between embeddings to detect semantically
 * equivalent cache queries, even if the exact text differs.
 */
export class SemanticDedup {
  private config: SemanticDedupConfig;
  private entries: SemanticEntry[] = [];
  private keyIndex = new Map<string, number>(); // key → index in entries[]
  private _hits = 0;
  private _misses = 0;

  constructor(
    private embedder: EmbeddingProvider,
    config?: Partial<SemanticDedupConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find a semantically similar cached key.
   * Returns the matching key + similarity score, or null.
   */
  async findSimilar(query: string): Promise<{ key: string; score: number } | null> {
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embedder.embed(query);
    } catch {
      this._misses++;
      return null;
    }

    let bestMatch: { key: string; score: number } | null = null;

    for (const entry of this.entries) {
      const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (score >= this.config.similarityThreshold) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { key: entry.key, score };
        }
      }
    }

    if (bestMatch) {
      this._hits++;
    } else {
      this._misses++;
    }

    return bestMatch;
  }

  /**
   * Find all semantically similar cached keys above threshold.
   */
  async findAllSimilar(query: string, limit = 5): Promise<Array<{ key: string; score: number }>> {
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embedder.embed(query);
    } catch {
      return [];
    }

    const results: Array<{ key: string; score: number }> = [];
    for (const entry of this.entries) {
      const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (score >= this.config.similarityThreshold) {
        results.push({ key: entry.key, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Add an entry to the semantic index.
   */
  async add(key: string, precomputedEmbedding?: number[]): Promise<void> {
    // Remove old entry if exists
    if (this.keyIndex.has(key)) {
      this.remove(key);
    }

    // Evict oldest if at capacity
    while (this.entries.length >= this.config.maxEmbeddings) {
      this.entries.shift();
      this.rebuildIndex();
    }

    let embedding: number[];
    if (precomputedEmbedding) {
      embedding = precomputedEmbedding;
    } else {
      try {
        embedding = await this.embedder.embed(key);
      } catch {
        return; // Skip if embedding fails
      }
    }

    const idx = this.entries.length;
    this.entries.push({ key, embedding, createdAt: Date.now() });
    this.keyIndex.set(key, idx);
  }

  /**
   * Remove an entry from the semantic index.
   */
  remove(key: string): boolean {
    const idx = this.keyIndex.get(key);
    if (idx === undefined) return false;

    this.entries.splice(idx, 1);
    this.keyIndex.delete(key);
    this.rebuildIndex();
    return true;
  }

  /**
   * Clear all semantic entries.
   */
  clear(): void {
    this.entries = [];
    this.keyIndex.clear();
  }

  get size(): number {
    return this.entries.length;
  }

  get stats(): { hits: number; misses: number; size: number } {
    return { hits: this._hits, misses: this._misses, size: this.entries.length };
  }

  /**
   * Bulk load entries (e.g., from warm source).
   */
  async bulkAdd(items: Array<{ key: string; embedding?: number[] }>): Promise<void> {
    for (const item of items) {
      await this.add(item.key, item.embedding);
    }
  }

  /**
   * Compute cosine similarity between two vectors.
   * Returns value in range [-1, 1].
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const ai = a[i] as number;
      const bi = b[i] as number;
      dotProduct += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  // --- Private ---

  private rebuildIndex(): void {
    this.keyIndex.clear();
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry) {
        this.keyIndex.set(entry.key, i);
      }
    }
  }
}
