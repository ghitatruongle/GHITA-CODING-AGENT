// Redis-backed cache with dynamic import and graceful fallback to LRUCache
// when Redis is unavailable. Implements BaseCache interface.

import { LRUCache } from './lru-cache.js';
import type { BaseCache } from './base-cache.js';

/**
 * Redis-backed cache with automatic fallback to in-memory LRUCache.
 * Falls back gracefully when ioredis is not installed or Redis is unreachable.
 */
export class RedisCache implements BaseCache {
  private client: {
    get: (key: string) => Promise<string | null>;
    set: (...args: unknown[]) => Promise<unknown>;
    del: (key: string) => Promise<unknown>;
    flushdb: () => Promise<unknown>;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
  } | null = null;
  private fallbackCache: LRUCache | null = null;
  private isConnected = false;

  constructor(
    private redisOptions?: {
      host?: string;
      port?: number;
      password?: string;
      [key: string]: unknown;
    },
  ) {
    this.init();
  }

  private async init(): Promise<void> {
    try {
      const ioRedisModule = await import('ioredis' as string);
      const RedisClass = ioRedisModule.default || ioRedisModule;
      this.client = new RedisClass(
        this.redisOptions || {
          host: '127.0.0.1',
          port: 6379,
          maxRetriesPerRequest: 1,
        },
      );

      if (this.client) {
        this.client.on('error', (_err: unknown) => {
          // Suppress errors and activate fallback
          this.isConnected = false;
          if (!this.fallbackCache) {
            this.fallbackCache = new LRUCache({ maxSize: 500, defaultTTL: 5 * 60 * 1000 });
          }
        });

        this.client.on('connect', () => {
          this.isConnected = true;
        });
      }
    } catch (err) {
      // ioredis is not installed or import failed
      this.fallbackCache = new LRUCache({ maxSize: 500, defaultTTL: 5 * 60 * 1000 });
    }
  }

  private ensureFallback(): LRUCache {
    if (!this.fallbackCache) {
      this.fallbackCache = new LRUCache({ maxSize: 500, defaultTTL: 5 * 60 * 1000 });
    }
    return this.fallbackCache;
  }

  async get(key: string): Promise<unknown> {
    if (!this.isConnected || !this.client) {
      return this.ensureFallback().get(key);
    }

    try {
      const val = await this.client.get(key);
      if (!val) return null;
      return JSON.parse(val);
    } catch (err) {
      return this.ensureFallback().get(key);
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected || !this.client) {
      this.ensureFallback().set(key, value, { ttl: ttlSeconds ? ttlSeconds * 1000 : undefined });
      return;
    }

    try {
      const strVal = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.set(key, strVal, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, strVal);
      }
    } catch (err) {
      this.ensureFallback().set(key, value, { ttl: ttlSeconds ? ttlSeconds * 1000 : undefined });
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      this.ensureFallback().delete(key);
      return;
    }

    try {
      await this.client.del(key);
    } catch (err) {
      this.ensureFallback().delete(key);
    }
  }

  async clear(): Promise<void> {
    if (!this.isConnected || !this.client) {
      this.ensureFallback().clear();
      return;
    }

    try {
      await this.client.flushdb();
    } catch (err) {
      this.ensureFallback().clear();
    }
  }
}
