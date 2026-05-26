// ==============================================================================
// GHITA CODING AGENT - Caching System (STT 2.1, 2.2, 2.3)
// ==============================================================================
import * as crypto from 'crypto';
// ------------------------------------------------------------------------------
// 2.1 In-Memory Cache
// ------------------------------------------------------------------------------
export class InMemoryCache {
    cache = new Map();
    async get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    async set(key, value, ttlSeconds) {
        const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
        this.cache.set(key, { value, expiresAt });
    }
    async delete(key) {
        this.cache.delete(key);
    }
    async clear() {
        this.cache.clear();
    }
}
// ------------------------------------------------------------------------------
// 2.2 Redis Cache (with dynamic import and graceful fallback)
// ------------------------------------------------------------------------------
export class RedisCache {
    redisOptions;
    client = null;
    fallbackCache = null;
    isConnected = false;
    constructor(redisOptions) {
        this.redisOptions = redisOptions;
        this.init();
    }
    async init() {
        try {
            const ioRedisModule = await import('ioredis');
            const RedisClass = ioRedisModule.default || ioRedisModule;
            this.client = new RedisClass(this.redisOptions || {
                host: '127.0.0.1',
                port: 6379,
                maxRetriesPerRequest: 1,
            });
            this.client.on('error', (_err) => {
                // Suppress errors and activate fallback
                this.isConnected = false;
                if (!this.fallbackCache) {
                    this.fallbackCache = new InMemoryCache();
                }
            });
            this.client.on('connect', () => {
                this.isConnected = true;
            });
        }
        catch (err) {
            // ioredis is not installed or import failed
            this.fallbackCache = new InMemoryCache();
        }
    }
    async get(key) {
        if (!this.isConnected || !this.client) {
            if (!this.fallbackCache)
                this.fallbackCache = new InMemoryCache();
            return this.fallbackCache.get(key);
        }
        try {
            const val = await this.client.get(key);
            if (!val)
                return null;
            return JSON.parse(val);
        }
        catch (err) {
            if (!this.fallbackCache)
                this.fallbackCache = new InMemoryCache();
            return this.fallbackCache.get(key);
        }
    }
    async set(key, value, ttlSeconds) {
        if (!this.isConnected || !this.client) {
            if (!this.fallbackCache)
                this.fallbackCache = new InMemoryCache();
            await this.fallbackCache.set(key, value, ttlSeconds);
            return;
        }
        try {
            const strVal = JSON.stringify(value);
            if (ttlSeconds) {
                await this.client.set(key, strVal, 'EX', ttlSeconds);
            }
            else {
                await this.client.set(key, strVal);
            }
        }
        catch (err) {
            if (!this.fallbackCache)
                this.fallbackCache = new InMemoryCache();
            await this.fallbackCache.set(key, value, ttlSeconds);
        }
    }
    async delete(key) {
        if (!this.isConnected || !this.client) {
            if (!this.fallbackCache)
                this.fallbackCache = new InMemoryCache();
            await this.fallbackCache.delete(key);
            return;
        }
        try {
            await this.client.del(key);
        }
        catch (err) {
            if (!this.fallbackCache)
                this.fallbackCache = new InMemoryCache();
            await this.fallbackCache.delete(key);
        }
    }
    async clear() {
        if (!this.isConnected || !this.client) {
            if (!this.fallbackCache)
                this.fallbackCache = new InMemoryCache();
            await this.fallbackCache.clear();
            return;
        }
        try {
            await this.client.flushdb();
        }
        catch (err) {
            if (!this.fallbackCache)
                this.fallbackCache = new InMemoryCache();
            await this.fallbackCache.clear();
        }
    }
}
export class SemanticCache {
    embedder;
    qdrantUrl;
    collectionName;
    threshold;
    fallbackCache = null;
    isInitialized = false;
    constructor(embedder, options) {
        this.embedder = embedder;
        this.qdrantUrl = options?.qdrantUrl || 'http://localhost:6333';
        this.collectionName = options?.collectionName || 'semantic_cache';
        this.threshold = options?.threshold !== undefined ? options.threshold : 0.9;
        if (options?.fallbackToInMemory !== false) {
            this.fallbackCache = new InMemoryCache();
        }
        this.ensureCollection();
    }
    async ensureCollection() {
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
        }
        catch (err) {
            // Qdrant server offline / connection refused
            this.isInitialized = false;
        }
    }
    getDeterministicUuid(text) {
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
    async get(key) {
        if (!this.isInitialized) {
            return this.fallbackCache ? this.fallbackCache.get(key) : null;
        }
        try {
            // 1. Generate embedding
            const embRes = await this.embedder.embed(key);
            const vector = embRes.embedding;
            // 2. Search similarity in Qdrant
            const searchRes = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vector,
                    limit: 1,
                    with_payload: true,
                }),
            });
            if (!searchRes.ok)
                throw new Error('Qdrant search failed');
            const data = await searchRes.json();
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
        }
        catch (err) {
            // Ignore Qdrant error and use fallback cache
            if (this.fallbackCache) {
                return this.fallbackCache.get(key);
            }
        }
        return null;
    }
    async set(key, value, ttlSeconds) {
        // Sync to fallback cache first
        if (this.fallbackCache) {
            await this.fallbackCache.set(key, value, ttlSeconds);
        }
        if (!this.isInitialized)
            return;
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
            if (!upsertRes.ok)
                throw new Error('Qdrant upsert failed');
        }
        catch (err) {
            // Ignore Qdrant errors
        }
    }
    async delete(key) {
        if (this.fallbackCache) {
            await this.fallbackCache.delete(key);
        }
        if (!this.isInitialized)
            return;
        try {
            const uuid = this.getDeterministicUuid(key);
            await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    points: [uuid],
                }),
            });
        }
        catch (err) {
            // Ignore Qdrant errors
        }
    }
    async clear() {
        if (this.fallbackCache) {
            await this.fallbackCache.clear();
        }
        if (!this.isInitialized)
            return;
        try {
            // Recreate collection to clear it completely
            await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
            });
            await this.ensureCollection();
        }
        catch (err) {
            // Ignore Qdrant errors
        }
    }
}
//# sourceMappingURL=cache.js.map