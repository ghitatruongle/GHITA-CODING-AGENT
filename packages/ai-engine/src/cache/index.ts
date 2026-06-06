// ==============================================================================
// GHITA CODING AGENT - Cache Module Barrel Export (Phase 26)
// ==============================================================================

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

// --- LRU Cache ---
export { LRUCache } from './lru-cache.js';

// --- Semantic Deduplication ---
export { SemanticDedup } from './semantic-dedup.js';

// --- Cache Warmer ---
export { CacheWarmer } from './cache-warmer.js';

// --- Unified Response Cache Engine ---
export { ResponseCacheEngine } from './response-cache.js';
