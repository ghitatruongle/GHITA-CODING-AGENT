export interface BaseCache {
    get(key: string): Promise<any>;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}
export declare class InMemoryCache implements BaseCache {
    private cache;
    get(key: string): Promise<any>;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}
export declare class RedisCache implements BaseCache {
    private redisOptions?;
    private client;
    private fallbackCache;
    private isConnected;
    constructor(redisOptions?: {
        host?: string;
        port?: number;
        password?: string;
        [key: string]: any;
    } | undefined);
    private init;
    get(key: string): Promise<any>;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}
export interface SemanticCacheOptions {
    qdrantUrl?: string;
    collectionName?: string;
    threshold?: number;
    fallbackToInMemory?: boolean;
}
export declare class SemanticCache implements BaseCache {
    private embedder;
    private qdrantUrl;
    private collectionName;
    private threshold;
    private fallbackCache;
    private isInitialized;
    constructor(embedder: {
        embed: (text: string) => Promise<{
            embedding: number[];
        }>;
    }, options?: SemanticCacheOptions);
    private ensureCollection;
    private getDeterministicUuid;
    get(key: string): Promise<any>;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}
//# sourceMappingURL=cache.d.ts.map