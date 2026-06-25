// ==============================================================================
// GHITA CODING AGENT - Embedding-Based Dedup (Phase 30)
// Cosine-similarity based deduplication of memory entries.
// ==============================================================================

import type {
  CompressableMemoryEntry,
  DedupResult,
  EmbeddingDedupConfig,
  EmbeddingProvider,
} from './types.js';
import { cosineSimilarityJS } from '../semantic/rustAddon.js';

// ---------------------------------------------------------------------------
// Embedding Dedup Engine
// ---------------------------------------------------------------------------

export class EmbeddingDedup {
  private config: Required<EmbeddingDedupConfig>;
  private embedder: EmbeddingProvider | null;
  /** In-memory vector index: id → embedding */
  private index: Map<string, number[]> = new Map();
  /** Reverse: id → entry metadata (for kept/removed decisions) */
  private meta: Map<string, CompressableMemoryEntry> = new Map();

  constructor(config?: Partial<EmbeddingDedupConfig>, embedder?: EmbeddingProvider) {
    this.config = {
      similarityThreshold: config?.similarityThreshold ?? 0.92,
      maxIndexSize: config?.maxIndexSize ?? 50_000,
      keepTopN: config?.keepTopN ?? 1,
      refreshOnAccess: config?.refreshOnAccess ?? false,
    };
    this.embedder = embedder ?? null;
  }

  /** Add an entry to the index (compute embedding if missing). */
  async add(entry: CompressableMemoryEntry): Promise<number[]> {
    if (!entry.embedding && this.embedder) {
      entry.embedding = await this.embedder.embed(entry.content);
    }
    if (entry.embedding) {
      this.evictIfNeeded();
      this.index.set(entry.id, entry.embedding);
    }
    this.meta.set(entry.id, entry);
    return entry.embedding ?? [];
  }

  /** Remove an entry from the index. */
  remove(id: string): void {
    this.index.delete(id);
    this.meta.delete(id);
  }

  /** Clear the entire index. */
  clear(): void {
    this.index.clear();
    this.meta.clear();
  }

  /** Number of entries in the index. */
  get size(): number {
    return this.index.size;
  }

  /**
   * Find entries in `entries` that are near-duplicates of entries already
   * in the index. Returns the dedup result.
   */
  async deduplicate(entries: CompressableMemoryEntry[]): Promise<DedupResult> {
    const removed: string[] = [];
    const kept: string[] = [];
    const pairs: Array<{ kept: string; removed: string; similarity: number }> = [];
    let charsSaved = 0;

    for (const entry of entries) {
      // Ensure we have an embedding
      if (!entry.embedding && this.embedder) {
        entry.embedding = await this.embedder.embed(entry.content);
      }
      if (!entry.embedding) {
        // No embedding → can't dedup, keep it
        kept.push(entry.id);
        continue;
      }

      // Find best match in the index
      const match = this.findSimilar(entry.embedding);
      if (match && match.similarity >= this.config.similarityThreshold) {
        // Duplicate of an existing entry — replace if newer
        const existing = this.meta.get(match.id);
        if (existing) {
          if (entry.timestamp > existing.timestamp) {
            // New entry is newer: replace existing
            this.index.delete(existing.id);
            this.index.set(entry.id, entry.embedding);
            this.meta.delete(existing.id);
            this.meta.set(entry.id, entry);
            removed.push(existing.id);
            kept.push(entry.id);
            pairs.push({
              kept: entry.id,
              removed: existing.id,
              similarity: match.similarity,
            });
            charsSaved += existing.content.length;
          } else {
            // Existing is newer: discard the new one
            removed.push(entry.id);
            charsSaved += entry.content.length;
            pairs.push({
              kept: existing.id,
              removed: entry.id,
              similarity: match.similarity,
            });
          }
        } else {
          // Index hit but no meta — accept the new entry
          this.index.set(entry.id, entry.embedding);
          this.meta.set(entry.id, entry);
          kept.push(entry.id);
        }
      } else {
        // No match — keep this entry
        this.index.set(entry.id, entry.embedding);
        this.meta.set(entry.id, entry);
        kept.push(entry.id);
      }
    }

    return { removed, kept, pairs, charsSaved };
  }

  /**
   * Find the most-similar entry already in the index.
   * Returns null if the index is empty.
   */
  findSimilar(embedding: number[]): { id: string; similarity: number } | null {
    let bestId: string | null = null;
    let bestScore = -1;

    for (const [id, vec] of this.index) {
      const score = cosineSimilarityJS(embedding, vec);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    if (bestId === null) return null;
    return { id: bestId, similarity: bestScore };
  }

  /** Get a snapshot of the index size. */
  stats(): { size: number; threshold: number } {
    return {
      size: this.index.size,
      threshold: this.config.similarityThreshold,
    };
  }

  // --- Internals ---------------------------------------------------------

  private evictIfNeeded(): void {
    if (this.index.size < this.config.maxIndexSize) return;
    // Simple eviction: drop the oldest (lowest id lexically) entries until at 80% capacity
    const target = Math.floor(this.config.maxIndexSize * 0.8);
    const ids = Array.from(this.index.keys()).sort();
    const toRemove = this.index.size - target;
    for (let i = 0; i < toRemove; i++) {
      const id = ids[i];
      if (id) {
        this.index.delete(id);
        this.meta.delete(id);
      }
    }
  }
}
