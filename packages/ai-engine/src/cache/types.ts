/** Cache entry metadata stored alongside the value */
export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number | null;
  hitCount: number;
  lastAccessedAt: number;
  size: number;
  tags: string[];
  embedding?: number[];
}

/** LRU eviction policy */
export type EvictionPolicy = 'lru' | 'lfu' | 'fifo';

/** Cache invalidation event types */
export type CacheInvalidationEvent =
  | { type: 'ttl'; keys: string[] }
  | { type: 'tag'; tag: string; keys: string[] }
  | { type: 'pattern'; pattern: string; keys: string[] }
  | { type: 'manual'; keys: string[] }
  | { type: 'eviction'; keys: string[]; reason: 'size' | 'memory' };

/** Event listener callback */
export type CacheEventListener = (event: CacheInvalidationEvent) => void;

/** Configuration for LRUCache */
export interface LRUCacheConfig {
  /** Maximum number of entries */
  maxSize: number;
  /** Default TTL in milliseconds (null = no expiry) */
  defaultTTL: number | null;
  /** Eviction policy */
  evictionPolicy: EvictionPolicy;
  /** Whether to reset TTL on access */
  refreshOnAccess: boolean;
  /** Cleanup interval in ms for expired entries (0 = disabled) */
  cleanupInterval: number;
  /** Max memory budget in bytes (approximate, 0 = unlimited) */
  maxMemoryBytes: number;
}

/** Configuration for SemanticDedup */
export interface SemanticDedupConfig {
  /** Cosine similarity threshold for dedup (0-1) */
  similarityThreshold: number;
  /** Embedding dimensions */
  embeddingDimensions: number;
  /** Maximum cached embeddings */
  maxEmbeddings: number;
}

/** Configuration for CacheWarmer */
export interface CacheWarmerConfig {
  /** Enable cache warming on startup */
  enabled: boolean;
  /** Top-N most accessed keys to warm */
  topN: number;
  /** Warm from persistent store */
  persistentStorePath: string | null;
  /** Warm from predefined key list */
  preloadKeys: string[];
}

/** Configuration for ResponseCacheEngine (unified) */
export interface ResponseCacheConfig {
  lru: Partial<LRUCacheConfig>;
  semantic: Partial<SemanticDedupConfig>;
  warmer: Partial<CacheWarmerConfig>;
  /** Namespace prefix for cache keys */
  namespace: string;
  /** Enable stats tracking */
  trackStats: boolean;
}

/** Cache statistics */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  sets: number;
  deletes: number;
  size: number;
  hitRate: number;
  averageLatencyMs: number;
  semanticHits: number;
  semanticMisses: number;
}

/** Embedding provider interface for semantic dedup */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

/** Cache key hash function */
export type KeyHashFunction = (input: string) => string;

/** Cache warming source */
export interface WarmSource {
  name: string;
  load(): Promise<Array<{ key: string; value: unknown; tags?: string[] }>>;
}
