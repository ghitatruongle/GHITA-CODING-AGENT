// ==============================================================================
// GHITA CODING AGENT - Response Cache Engine (Phase 26)
// Unified caching layer: LRU + TTL + Semantic Dedup + Cache Warming
// ==============================================================================

import * as crypto from 'node:crypto';
import { LRUCache } from './lru-cache.js';
import { SemanticDedup } from './semantic-dedup.js';
import { CacheWarmer } from './cache-warmer.js';
import type {
  ResponseCacheConfig,
  CacheStats,
  EmbeddingProvider,
  CacheEventListener,
  CacheInvalidationEvent,
  WarmSource,
} from './types.js';

const DEFAULT_CONFIG: ResponseCacheConfig = {
  lru: {},
  semantic: {},
  warmer: {},
  namespace: 'ghita',
  trackStats: true,
};

interface PendingRequest<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Unified Response Cache Engine.
 * Combines LRU cache with TTL, semantic deduplication via cosine similarity,
 * event-driven invalidation, request deduplication, and cache warming.
 */
export class ResponseCacheEngine<T = unknown> {
  private config: ResponseCacheConfig;
  private lru: LRUCache<T>;
  private semantic: SemanticDedup | null = null;
  private warmer: CacheWarmer<T>;
  private pending = new Map<string, PendingRequest<T>>();
  private latencySamples: number[] = [];
  private maxLatencySamples = 1000;
  private _initialized = false;

  constructor(config?: Partial<ResponseCacheConfig>, embedder?: EmbeddingProvider) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.lru = new LRUCache<T>(this.config.lru);
    this.warmer = new CacheWarmer<T>(this.config.warmer);

    if (embedder) {
      this.semantic = new SemanticDedup(embedder, this.config.semantic);
    }

    // Track latency from cache events
    if (this.config.trackStats) {
      this.lru.on((event: CacheInvalidationEvent) => {
        if (event.type === 'eviction') {
          // Track eviction metrics
        }
      });
    }
  }

  /**
   * Get a cached response by key.
   * Falls back to semantic dedup if exact match not found.
   */
  async get(key: string): Promise<{ value: T; source: 'exact' | 'semantic'; score?: number } | null> {
    const start = Date.now();
    const namespacedKey = this.namespaceKey(key);

    // 1. Exact match
    const exact = this.lru.get(namespacedKey);
    if (exact !== null) {
      this.trackLatency(Date.now() - start);
      return { value: exact, source: 'exact' };
    }

    // 2. Semantic dedup
    if (this.semantic) {
      const similar = await this.semantic.findSimilar(key);
      if (similar) {
        const semanticValue = this.lru.get(this.namespaceKey(similar.key));
        if (semanticValue !== null) {
          this.trackLatency(Date.now() - start);
          return { value: semanticValue, source: 'semantic', score: similar.score };
        }
      }
    }

    this.trackLatency(Date.now() - start);
    return null;
  }

  /**
   * Set a cached response.
   * Also indexes in semantic dedup if available.
   */
  async set(
    key: string,
    value: T,
    options?: { ttl?: number; tags?: string[] },
  ): Promise<void> {
    const namespacedKey = this.namespaceKey(key);

    this.lru.set(namespacedKey, value, {
      ttl: options?.ttl,
      tags: options?.tags,
    });

    // Index in semantic dedup
    if (this.semantic) {
      await this.semantic.add(key);
    }
  }

  /**
   * Get or compute: if cache hit, return cached value.
   * If miss, execute the factory function and cache the result.
   * Includes request deduplication for concurrent identical calls.
   */
  async getOrSet(
    key: string,
    factory: () => Promise<T>,
    options?: { ttl?: number; tags?: string[] },
  ): Promise<{ value: T; cached: boolean; source?: 'exact' | 'semantic' }> {
    // 1. Check cache first
    const cached = await this.get(key);
    if (cached) {
      return { value: cached.value, cached: true, source: cached.source };
    }

    // 2. Request deduplication
    const namespacedKey = this.namespaceKey(key);
    const existing = this.pending.get(namespacedKey);
    if (existing) {
      const value = await existing.promise;
      return { value, cached: false };
    }

    // 3. Execute factory with dedup guard
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.pending.set(namespacedKey, { promise, resolve, reject });

    try {
      const value = await factory();
      await this.set(key, value, options);
      resolve(value);
      return { value, cached: false };
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      this.pending.delete(namespacedKey);
    }
  }

  /**
   * Delete a specific key.
   */
  delete(key: string): boolean {
    const deleted = this.lru.delete(this.namespaceKey(key));
    if (this.semantic) {
      this.semantic.remove(key);
    }
    return deleted;
  }

  /**
   * Invalidate by tag.
   */
  invalidateByTag(tag: string): string[] {
    return this.lru.invalidateByTag(tag);
  }

  /**
   * Invalidate by regex pattern.
   */
  invalidateByPattern(pattern: string | RegExp): string[] {
    return this.lru.invalidateByPattern(pattern);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.lru.clear();
    if (this.semantic) {
      this.semantic.clear();
    }
  }

  /**
   * Warm the cache on startup.
   */
  async warm(sources?: WarmSource[]): Promise<number> {
    if (sources) {
      for (const source of sources) {
        this.warmer.addSource(source);
      }
    }

    const entries = await this.warmer.warm();
    for (const entry of entries) {
      await this.set(entry.key, entry.value, { tags: entry.tags });
    }

    this._initialized = true;
    return entries.length;
  }

  /**
   * Subscribe to cache invalidation events.
   */
  onInvalidation(listener: CacheEventListener): () => void {
    return this.lru.on(listener);
  }

  /**
   * Get comprehensive cache statistics.
   */
  get stats(): CacheStats {
    const lruStats = this.lru.stats;
    const semanticStats = this.semantic?.stats ?? { hits: 0, misses: 0, size: 0 };
    const totalRequests = lruStats.hits + lruStats.misses;

    return {
      ...lruStats,
      hitRate: totalRequests > 0 ? lruStats.hits / totalRequests : 0,
      averageLatencyMs:
        this.latencySamples.length > 0
          ? this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
          : 0,
      semanticHits: semanticStats.hits,
      semanticMisses: semanticStats.misses,
    };
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get size(): number {
    return this.lru.size;
  }

  /**
   * Export cache snapshot for persistence.
   */
  snapshot(): Array<{ key: string; value: T; hitCount: number; tags: string[] }> {
    return this.lru.entries().map((e) => ({
      key: e.key.replace(`${this.config.namespace}:`, ''),
      value: e.value,
      hitCount: e.hitCount,
      tags: e.tags,
    }));
  }

  /**
   * Stop cleanup timers and release resources.
   */
  destroy(): void {
    this.lru.destroy();
  }

  /**
   * Generate a deterministic cache key from a chat request.
   */
  static chatKey(provider: string, model: string, messages: string, options?: string): string {
    const input = `${provider}:${model}:${messages}:${options ?? ''}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 20);
    return `chat:${hash}`;
  }

  // --- Private ---

  private namespaceKey(key: string): string {
    return `${this.config.namespace}:${key}`;
  }

  private trackLatency(ms: number): void {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > this.maxLatencySamples) {
      this.latencySamples.shift();
    }
  }
}
