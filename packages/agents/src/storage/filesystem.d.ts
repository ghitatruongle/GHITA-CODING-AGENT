import type { StorageBackend } from './types.js';
export interface FileSystemStorageOptions {
    /** Directory path for storing files */
    basePath: string;
    /** File extension */
    extension?: string;
    /** TTL in milliseconds */
    ttl?: number;
}
export declare class FileSystemStorage<T = unknown> implements StorageBackend<T> {
    private readonly basePath;
    private readonly extension;
    private readonly ttl;
    constructor(options: FileSystemStorageOptions);
    private filePath;
    private isExpired;
    private readEntry;
    private writeEntry;
    get(key: string): Promise<T | undefined>;
    set(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
    has(key: string): Promise<boolean>;
    keys(): Promise<string[]>;
    clear(): Promise<void>;
    size(): Promise<number>;
}
//# sourceMappingURL=filesystem.d.ts.map