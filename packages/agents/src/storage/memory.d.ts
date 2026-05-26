import type { StorageBackend, StorageOptions } from './types.js';
export declare class InMemoryStorage<T = unknown> implements StorageBackend<T> {
    private readonly store;
    private readonly opts;
    constructor(options?: StorageOptions);
    private namespaced;
    private isExpired;
    private evict;
    get(key: string): Promise<T | undefined>;
    set(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
    has(key: string): Promise<boolean>;
    keys(): Promise<string[]>;
    clear(): Promise<void>;
    size(): Promise<number>;
}
//# sourceMappingURL=memory.d.ts.map