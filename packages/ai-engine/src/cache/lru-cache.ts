// ==============================================================================
// GHITA CODING AGENT - LRU Cache with TTL + Event-Driven Invalidation (Phase 26)
// ==============================================================================

import * as crypto from 'node:crypto';
import type {
  CacheEntry,
  LRUCacheConfig,
  CacheInvalidationEvent,
  CacheEventListener,
  CacheStats,
} from './types.js';

const DEFAULT_CONFIG: LRUCacheConfig = {
  maxSize: 1000,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  evictionPolicy: 'lru',
  refreshOnAccess: false,
  cleanupInterval: 60_000,
  maxMemoryBytes: 0,
};

/**
 * LRU cache with TTL expiration and event-driven invalidation.
 * Uses a doubly-linked list for O(1) LRU operations.
 */
export class LRUCache<T = unknown> {
  private config: LRUCacheConfig;
  private map = new Map<string, CacheEntry<T>>();
  private order: string[] = []; // MRU at end, LRU at front
  private listeners = new Map<string, Set<CacheEventListener>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private _stats: CacheStats;
  private globalListeners: CacheEventListener[] = [];

  constructor(config?: Partial<LRUCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._stats = this.emptyStats();

    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.evictExpired();
      }, this.config.cleanupInterval);
      // Allow process to exit even if timer is active
      if (
        this.cleanupTimer &&
        typeof this.cleanupTimer === 'object' &&
        'unref' in this.cleanupTimer
      ) {
        this.cleanupTimer.unref();
      }
    }
  }

  // --- Public API ---

  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) {
      this._stats.misses++;
      return null;
    }

    // Check TTL
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.delete(key);
      this._stats.misses++;
      return null;
    }

    // Update access metadata
    entry.hitCount++;
    entry.lastAccessedAt = Date.now();
    if (this.config.refreshOnAccess && this.config.defaultTTL !== null) {
      entry.expiresAt = Date.now() + this.config.defaultTTL;
    }

    // Move to MRU position
    this.moveToMRU(key);

    this._stats.hits++;
    return entry.value;
  }

  set(
    key: string,
    value: T,
    options?: { ttl?: number; tags?: string[]; embedding?: number[] },
  ): void {
    const existing = this.map.get(key);
    const ttl = options?.ttl ?? this.config.defaultTTL;
    const size = this.estimateSize(value);

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: ttl !== null ? Date.now() + ttl : null,
      hitCount: existing?.hitCount ?? 0,
      lastAccessedAt: Date.now(),
      size,
      tags: options?.tags ?? existing?.tags ?? [],
      embedding: options?.embedding ?? existing?.embedding,
    };

    if (existing) {
      this.map.set(key, entry);
    } else {
      // Evict if needed
      while (this.map.size >= this.config.maxSize) {
        this.evictOne();
      }
      this.map.set(key, entry);
      this.order.push(key);
    }

    this._stats.sets++;
  }

  has(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const existed = this.map.delete(key);
    if (existed) {
      this.order = this.order.filter((k) => k !== key);
      this._stats.deletes++;
    }
    return existed;
  }

  clear(): void {
    const keys = Array.from(this.map.keys());
    this.map.clear();
    this.order = [];
    if (keys.length > 0) {
      this.emit({ type: 'manual', keys });
    }
  }

  /** Invalidate all entries matching a tag */
  invalidateByTag(tag: string): string[] {
    const keys: string[] = [];
    for (const [key, entry] of this.map) {
      if (entry.tags.includes(tag)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      this.map.delete(key);
    }
    this.order = this.order.filter((k) => !keys.includes(k));
    if (keys.length > 0) {
      this.emit({ type: 'tag', tag, keys });
    }
    return keys;
  }

  /** Invalidate all entries matching a regex pattern */
  invalidateByPattern(pattern: string | RegExp): string[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const keys: string[] = [];
    for (const key of this.map.keys()) {
      if (regex.test(key)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      this.map.delete(key);
    }
    this.order = this.order.filter((k) => !keys.includes(k));
    if (keys.length > 0) {
      this.emit({ type: 'pattern', pattern: regex.source, keys });
    }
    return keys;
  }

  /** Batch set multiple entries */
  setMany(entries: Array<{ key: string; value: T; ttl?: number; tags?: string[] }>): void {
    for (const e of entries) {
      this.set(e.key, e.value, { ttl: e.ttl, tags: e.tags });
    }
  }

  /** Batch get multiple entries */
  getMany(keys: string[]): Map<string, T> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const val = this.get(key);
      if (val !== null) {
        result.set(key, val);
      }
    }
    return result;
  }

  /** Get all entries (snapshot) */
  entries(): CacheEntry<T>[] {
    return Array.from(this.map.values());
  }

  /** Get top-N most accessed keys */
  topKeys(n: number): Array<{ key: string; hitCount: number; value: T }> {
    return Array.from(this.map.values())
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, n)
      .map((e) => ({ key: e.key, hitCount: e.hitCount, value: e.value }));
  }

  get size(): number {
    return this.map.size;
  }

  get stats(): CacheStats {
    return { ...this._stats, size: this.map.size };
  }

  /** Subscribe to invalidation events */
  on(listener: CacheEventListener): () => void {
    this.globalListeners.push(listener);
    return () => {
      this.globalListeners = this.globalListeners.filter((l) => l !== listener);
    };
  }

  /** Subscribe to events for a specific event type */
  onEvent(type: string, listener: CacheEventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(listener);
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /** Stop the cleanup timer and release resources */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.listeners.clear();
    this.globalListeners = [];
  }

  // --- Private ---

  private moveToMRU(key: string): void {
    const idx = this.order.indexOf(key);
    if (idx !== -1) {
      this.order.splice(idx, 1);
    }
    this.order.push(key);
  }

  private evictOne(): void {
    if (this.order.length === 0) return;

    let victimKey: string | undefined;

    switch (this.config.evictionPolicy) {
      case 'lru': {
        victimKey = this.order.shift();
        break;
      }
      case 'lfu': {
        let minHits = Infinity;
        let minKey = this.order[0];
        for (const k of this.order) {
          const entry = this.map.get(k);
          if (entry && entry.hitCount < minHits) {
            minHits = entry.hitCount;
            minKey = k;
          }
        }
        victimKey = minKey;
        this.order = this.order.filter((k) => k !== victimKey);
        break;
      }
      case 'fifo': {
        victimKey = this.order.shift();
        break;
      }
    }

    if (victimKey) {
      this.map.delete(victimKey);
      this._stats.evictions++;
      this.emit({ type: 'eviction', keys: [victimKey], reason: 'size' });
    }
  }

  private evictExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.map) {
      if (entry.expiresAt !== null && entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.map.delete(key);
    }
    this.order = this.order.filter((k) => !expiredKeys.includes(k));

    if (expiredKeys.length > 0) {
      this.emit({ type: 'ttl', keys: expiredKeys });
    }
  }

  private emit(event: CacheInvalidationEvent): void {
    for (const listener of this.globalListeners) {
      try {
        listener(event);
      } catch {
        // Listener error should not break cache
      }
    }
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch {
          // Listener error should not break cache
        }
      }
    }
  }

  private estimateSize(value: unknown): number {
    try {
      const str = JSON.stringify(value);
      return str ? str.length * 2 : 64; // Rough UTF-16 estimate
    } catch {
      return 64;
    }
  }

  /** Generate a deterministic cache key from input */
  static hashKey(input: string, prefix?: string): string {
    const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
    return prefix ? `${prefix}:${hash}` : hash;
  }

  private emptyStats(): CacheStats {
    return {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      deletes: 0,
      size: 0,
      hitRate: 0,
      averageLatencyMs: 0,
      semanticHits: 0,
      semanticMisses: 0,
    };
  }
}
