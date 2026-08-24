// Simple async cache interface for backward compatibility with the legacy
// utils/cache.ts module. For advanced use cases (LRU, eviction policies,
// event-driven invalidation), prefer LRUCache from lru-cache.ts.

/** Base async cache interface (legacy STT 2.1) */
export interface BaseCache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Simple in-memory cache with TTL support.
 * Uses a Map with expiration timestamps. For production workloads
 * with eviction policies and stats, prefer LRUCache.
 */
export class InMemoryCache implements BaseCache {
  private cache = new Map<string, { value: unknown; expiresAt: number | null }>();

  async get(key: string): Promise<unknown> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.cache.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}
