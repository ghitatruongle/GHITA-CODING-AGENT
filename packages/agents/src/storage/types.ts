export interface StorageBackend<T = unknown> {
  /** Retrieve a value by key */
  get(key: string): Promise<T | undefined>;

  /** Store a value with key */
  set(key: string, value: T): Promise<void>;

  /** Delete a value by key */
  delete(key: string): Promise<boolean>;

  /** Check if key exists */
  has(key: string): Promise<boolean>;

  /** List all keys */
  keys(): Promise<string[]>;

  /** Clear all stored values */
  clear(): Promise<void>;

  /** Count of stored items */
  size(): Promise<number>;
}

export interface SerializedEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl?: number;
}

export interface StorageOptions {
  /** TTL in milliseconds (0 = no expiry) */
  ttl?: number;
  /** Maximum number of entries */
  maxSize?: number;
  /** Namespace for key isolation */
  namespace?: string;
}

export type EncoderFn<T> = (value: T) => string;
export type DecoderFn<T> = (encoded: string) => T;
