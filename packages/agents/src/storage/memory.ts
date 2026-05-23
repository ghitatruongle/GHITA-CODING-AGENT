// ==============================================================================
// GHITA CODING AGENT - In-Memory Storage Backend
// ==============================================================================

import type { StorageBackend, StorageOptions, SerializedEntry } from './types.js';

export class InMemoryStorage<T = unknown> implements StorageBackend<T> {
  private readonly store = new Map<string, SerializedEntry<T>>();
  private readonly opts: Required<StorageOptions>;

  constructor(options?: StorageOptions) {
    this.opts = {
      ttl: options?.ttl ?? 0,
      maxSize: options?.maxSize ?? 10000,
      namespace: options?.namespace ?? '',
    };
  }

  private namespaced(key: string): string {
    return this.opts.namespace ? `${this.opts.namespace}:${key}` : key;
  }

  private isExpired(entry: SerializedEntry<T>): boolean {
    if (!entry.ttl || entry.ttl === 0) return false;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private evict(): void {
    if (this.store.size <= this.opts.maxSize) return;
    // Remove oldest entries
    const entries = [...this.store.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );
    const toRemove = entries.length - this.opts.maxSize;
    for (let i = 0; i < toRemove; i++) {
      this.store.delete(entries[i]![0]);
    }
  }

  async get(key: string): Promise<T | undefined> {
    const nsKey = this.namespaced(key);
    const entry = this.store.get(nsKey);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.store.delete(nsKey);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: T): Promise<void> {
    const nsKey = this.namespaced(key);
    this.store.set(nsKey, {
      key: nsKey,
      value,
      timestamp: Date.now(),
      ttl: this.opts.ttl,
    });
    this.evict();
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(this.namespaced(key));
  }

  async has(key: string): Promise<boolean> {
    const nsKey = this.namespaced(key);
    const entry = this.store.get(nsKey);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.store.delete(nsKey);
      return false;
    }
    return true;
  }

  async keys(): Promise<string[]> {
    const keys: string[] = [];
    const prefix = this.opts.namespace ? `${this.opts.namespace}:` : '';
    for (const [key, entry] of this.store.entries()) {
      if (!this.isExpired(entry)) {
        keys.push(prefix ? key.slice(prefix.length) : key);
      }
    }
    return keys;
  }

  async clear(): Promise<void> {
    if (this.opts.namespace) {
      const prefix = `${this.opts.namespace}:`;
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) this.store.delete(key);
      }
    } else {
      this.store.clear();
    }
  }

  async size(): Promise<number> {
    let count = 0;
    const prefix = this.opts.namespace ? `${this.opts.namespace}:` : '';
    for (const [key, entry] of this.store.entries()) {
      if (!this.isExpired(entry) && (!prefix || key.startsWith(prefix))) {
        count++;
      }
    }
    return count;
  }
}
