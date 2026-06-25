// ==============================================================================
// GHITA CODING AGENT - Qdrant Semantic Cache
// ==============================================================================
// Vector similarity cache backed by Qdrant with LRUCache fallback.
// Uses embedding cosine similarity for semantic cache hits.
// Falls back to in-memory LRUCache when Qdrant is unavailable.
// ==============================================================================

import * as crypto from 'node:crypto';
import { LRUCache } from './lru-cache.js';
import type { BaseCache } from './base-cache.js';

export interface SemanticCacheOptions {
  qdrantUrl?: string;
  collectionName?: string;
  threshold?: number;
  fallbackToInMemory?: boolean;
}

/**
 * Semantic cache using Qdrant vector similarity search.
 * Falls back to an in-memory LRUCache when Qdrant is unavailable.
 */
export class SemanticCache implements BaseCache {
  private qdrantUrl: string;
  private collectionName: string;
  private threshold: number;
  private fallbackCache: LRUCache | null = null;
  private isInitialized = false;

  constructor(
    private embedder: { embed: (text: string) => Promise<{ embedding: number[] }> },
    options?: SemanticCacheOptions,
  ) {
    this.qdrantUrl = options?.qdrantUrl || 'http://localhost:6333';
    this.collectionName = options?.collectionName || 'semantic_cache';
    this.threshold = options?.threshold !== undefined ? options.threshold : 0.9;

    if (options?.fallbackToInMemory !== false) {
      this.fallbackCache = new LRUCache({ maxSize: 500, defaultTTL: 5 * 60 * 1000 });
    }

    this.ensureCollection();
  }

  private async ensureCollection(): Promise<void> {
    try {
      // Check if collection exists
      const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.status === 404) {
        // Create collection (assume 1536 dimensions as default for OpenAI/embeddings)
        await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: {
              size: 1536,
              distance: 'Cosine',
            },
          }),
        });
      }
      this.isInitialized = true;
    } catch (err) {
      // Qdrant server offline / connection refused
      if (process.env.GHITA_DEBUG) {
        console.info('[SemanticCache] Not available (Qdrant offline):', (err as Error).message);
      }
      this.isInitialized = false;
    }
  }

  private getDeterministicUuid(text: string): string {
    const hash = crypto.createHash('md5').update(text).digest('hex');
    // Format hash into UUID structure: 8-4-4-4-12
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      hash.substring(12, 16),
      hash.substring(16, 20),
      hash.substring(20, 32),
    ].join('-');
  }

  async get(key: string): Promise<unknown> {
    if (!this.isInitialized) {
      return this.fallbackCache ? this.fallbackCache.get(key) : null;
    }

    try {
      // 1. Generate embedding
      const embRes = await this.embedder.embed(key);
      const vector = embRes.embedding;

      // 2. Search similarity in Qdrant
      const searchRes = await fetch(
        `${this.qdrantUrl}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector,
            limit: 1,
            with_payload: true,
          }),
        },
      );

      if (!searchRes.ok) throw new Error('Qdrant search failed');

      const data = (await searchRes.json()) as {
        result?: Array<{ score: number; payload?: { expiresAt: number | null; value: unknown } }>;
      };
      const hit = data.result?.[0];

      if (hit && hit.score >= this.threshold) {
        const payload = hit.payload;
        if (payload) {
          // Check expiration
          if (payload.expiresAt !== null && payload.expiresAt < Date.now()) {
            await this.delete(key);
            return null;
          }
          return payload.value;
        }
      }
    } catch (err) {
      // Ignore Qdrant error and use fallback cache
      if (this.fallbackCache) {
        return this.fallbackCache.get(key);
      }
    }

    return null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    // Sync to fallback cache first
    if (this.fallbackCache) {
      this.fallbackCache.set(key, value, { ttl: ttlSeconds ? ttlSeconds * 1000 : undefined });
    }

    if (!this.isInitialized) return;

    try {
      // 1. Generate embedding
      const embRes = await this.embedder.embed(key);
      const vector = embRes.embedding;
      const uuid = this.getDeterministicUuid(key);
      const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;

      // 2. Upsert Qdrant point
      const upsertRes = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            {
              id: uuid,
              vector,
              payload: {
                key,
                value,
                expiresAt,
              },
            },
          ],
        }),
      });

      if (!upsertRes.ok) throw new Error('Qdrant upsert failed');
    } catch (err) {
      console.warn(
        '[SemanticCache] Qdrant upsert error:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async delete(key: string): Promise<void> {
    if (this.fallbackCache) {
      this.fallbackCache.delete(key);
    }

    if (!this.isInitialized) return;

    try {
      const uuid = this.getDeterministicUuid(key);
      await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [uuid],
        }),
      });
    } catch (err) {
      console.warn(
        '[SemanticCache] Qdrant delete error:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async clear(): Promise<void> {
    if (this.fallbackCache) {
      this.fallbackCache.clear();
    }

    if (!this.isInitialized) return;

    try {
      // Recreate collection to clear it completely
      await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      await this.ensureCollection();
    } catch (err) {
      console.warn(
        '[SemanticCache] Qdrant clear error:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
