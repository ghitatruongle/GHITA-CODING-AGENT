import type { StorageBackend, EncoderFn, DecoderFn } from './types.js';
export interface EncoderStorageOptions<T> {
    /** The underlying storage backend to delegate to */
    backend: StorageBackend<string>;
    /** Encoder function: T → string */
    encoder: EncoderFn<T>;
    /** Decoder function: string → T */
    decoder: DecoderFn<T>;
}
/**
 * Wraps any StorageBackend<string> and applies custom encode/decode transforms
 * to support arbitrary types (e.g. compress, encrypt, serialize).
 */
export declare class EncoderBackedStorage<T = unknown> implements StorageBackend<T> {
    private readonly backend;
    private readonly encoder;
    private readonly decoder;
    constructor(options: EncoderStorageOptions<T>);
    get(key: string): Promise<T | undefined>;
    set(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
    has(key: string): Promise<boolean>;
    keys(): Promise<string[]>;
    clear(): Promise<void>;
    size(): Promise<number>;
}
/** Convenience: JSON encoder/decoder pair */
export declare const JSONEncoder: {
    encode: <T>(value: T) => string;
    decode: <T>(encoded: string) => T;
};
//# sourceMappingURL=encoder.d.ts.map