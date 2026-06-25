// ==============================================================================
// GHITA CODING AGENT - Caching System (DEPRECATED SHIM)
// ==============================================================================
// @deprecated This module re-exports from ../cache/ for backward compatibility.
// Please import directly from the cache module:
//   import { InMemoryCache, RedisCache, SemanticCache } from '../cache/index.js';
//   import type { BaseCache, SemanticCacheOptions } from '../cache/index.js';
// ==============================================================================

export type { BaseCache } from '../cache/base-cache.js';
export { InMemoryCache } from '../cache/base-cache.js';
export { RedisCache } from '../cache/redis-cache.js';
export type { SemanticCacheOptions } from '../cache/semantic-cache.js';
export { SemanticCache } from '../cache/semantic-cache.js';
