// ==============================================================================
// GHITA CODING AGENT - Cache Module Barrel Export
// ==============================================================================

// --- Base Cache (legacy async interface) ---
export type { BaseCache } from './base-cache.js';
export { InMemoryCache } from './base-cache.js';

// --- Redis Cache ---
export { RedisCache } from './redis-cache.js';

// --- Semantic Cache (Qdrant vector similarity) ---
export type { SemanticCacheOptions } from './semantic-cache.js';
export { SemanticCache } from './semantic-cache.js';

// --- LRU Cache (modern sync interface) ---
export { LRUCache } from './lru-cache.js';

// --- Semantic Deduplication ---
export { SemanticDedup } from './semantic-dedup.js';

// --- Cache Warmer ---
export { CacheWarmer } from './cache-warmer.js';

// --- Unified Response Cache Engine ---
export { ResponseCacheEngine } from './response-cache.js';

// --- Types ---
export type {
  CacheEntry,
  EvictionPolicy,
  CacheInvalidationEvent,
  CacheEventListener,
  LRUCacheConfig,
  SemanticDedupConfig,
  CacheWarmerConfig,
  ResponseCacheConfig,
  CacheStats,
  EmbeddingProvider,
  KeyHashFunction,
  WarmSource,
} from './types.js';
