// ==============================================================================
// GHITA CODING AGENT - Encoder-Backed Storage Backend
// ==============================================================================

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
export class EncoderBackedStorage<T = unknown> implements StorageBackend<T> {
  private readonly backend: StorageBackend<string>;
  private readonly encoder: EncoderFn<T>;
  private readonly decoder: DecoderFn<T>;

  constructor(options: EncoderStorageOptions<T>) {
    this.backend = options.backend;
    this.encoder = options.encoder;
    this.decoder = options.decoder;
  }

  async get(key: string): Promise<T | undefined> {
    const raw = await this.backend.get(key);
    if (raw === undefined) return undefined;
    try {
      return this.decoder(raw);
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: T): Promise<void> {
    const encoded = this.encoder(value);
    await this.backend.set(key, encoded);
  }

  async delete(key: string): Promise<boolean> {
    return this.backend.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.backend.has(key);
  }

  async keys(): Promise<string[]> {
    return this.backend.keys();
  }

  async clear(): Promise<void> {
    return this.backend.clear();
  }

  async size(): Promise<number> {
    return this.backend.size();
  }
}

/** Convenience: JSON encoder/decoder pair */
export const JSONEncoder = {
  encode: <T>(value: T): string => JSON.stringify(value),
  decode: <T>(encoded: string): T => JSON.parse(encoded) as T,
};
