// ==============================================================================
// GHITA CODING AGENT - AI Engine v1.1.0 Track 4 P53: distributed cache
// ==============================================================================
// Multi-layer cache: primary (Redis/remote) + secondary (disk/S3 snapshot),
// plus a dual-mode wrapper that runs an exact cache and a semantic cache
// side by side with a shared TTL. All backends are injectable for tests.
// ==============================================================================

import type { BaseCache } from './base-cache.js';

export interface ObjectStore {
  get(key: string): Promise<{ value: string; expiresAt?: number } | undefined>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Layered cache: read primary → secondary; write both. */
export class DistributedCache implements BaseCache {
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly primary: BaseCache,
    private readonly secondary: BaseCache,
  ) {}

  async get(key: string): Promise<string | null> {
    const primary = await this.primary.get(key);
    if (primary !== null && primary !== undefined) {
      this.hits += 1;
      return String(primary);
    }
    const secondary = await this.secondary.get(key);
    if (secondary !== null && secondary !== undefined) {
      this.hits += 1;
      // Promote back to the primary layer.
      await this.primary.set(key, secondary).catch(() => undefined);
      return String(secondary);
    }
    this.misses += 1;
    return null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.primary.set(key, value, ttlSeconds).catch(() => undefined);
    await this.secondary.set(key, value, ttlSeconds).catch(() => undefined);
  }

  async delete(key: string): Promise<void> {
    await this.primary.delete(key).catch(() => undefined);
    await this.secondary.delete(key).catch(() => undefined);
  }

  async clear(): Promise<void> {
    await this.primary.clear().catch(() => undefined);
    await this.secondary.clear().catch(() => undefined);
  }

  stats(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }
}

/** Object-store-backed cache (disk/S3 snapshot layer). */
export class ObjectStoreCache implements BaseCache {
  constructor(private readonly store: ObjectStore) {}

  async get(key: string): Promise<string | null> {
    const entry = await this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      await this.store.delete(key).catch(() => undefined);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.store.set(key, value, ttlSeconds ? ttlSeconds * 1000 : undefined);
  }

  async delete(key: string): Promise<void> {
    await this.store.delete(key);
  }

  async clear(): Promise<void> {
    // Optional in the base contract; object stores implement it when needed.
  }
}

export interface DualCacheOptions {
  ttlSeconds?: number;
  semanticThreshold?: number;
}

/**
 * Dual-mode cache: an exact cache and a semantic cache share a key namespace
 * with a common TTL. Writes fan out to both; reads try exact first.
 */
export class DualModeCache implements BaseCache {
  private readonly ttlSeconds: number;

  constructor(
    private readonly exact: BaseCache,
    private readonly semantic: BaseCache,
    options: DualCacheOptions = {},
  ) {
    this.ttlSeconds = options.ttlSeconds ?? 0;
  }

  async get(key: string): Promise<string | null> {
    const exact = await this.exact.get(key);
    if (exact !== null && exact !== undefined) return String(exact);
    const semantic = await this.semantic.get(key);
    return semantic !== null && semantic !== undefined ? String(semantic) : null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.ttlSeconds;
    await this.exact.set(key, value, ttl).catch(() => undefined);
    await this.semantic.set(key, value, ttl).catch(() => undefined);
  }

  async delete(key: string): Promise<void> {
    await this.exact.delete(key).catch(() => undefined);
    await this.semantic.delete(key).catch(() => undefined);
  }

  async clear(): Promise<void> {
    await this.exact.clear().catch(() => undefined);
    await this.semantic.clear().catch(() => undefined);
  }
}
