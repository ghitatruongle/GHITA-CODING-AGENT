import type { StorageBackend, SerializedEntry } from './types.js';

export interface FileSystemStorageOptions {
  /** Directory path for storing files */
  basePath: string;
  /** File extension */
  extension?: string;
  /** TTL in milliseconds */
  ttl?: number;
}

export class FileSystemStorage<T = unknown> implements StorageBackend<T> {
  private readonly basePath: string;
  private readonly extension: string;
  private readonly ttl: number;

  constructor(options: FileSystemStorageOptions) {
    this.basePath = options.basePath;
    this.extension = options.extension ?? '.json';
    this.ttl = options.ttl ?? 0;
  }

  private filePath(key: string): string {
    // Sanitize key to safe filename
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${this.basePath}/${safe}${this.extension}`;
  }

  private isExpired(entry: SerializedEntry<T>): boolean {
    if (!entry.ttl || entry.ttl === 0) return false;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private async readEntry(key: string): Promise<SerializedEntry<T> | undefined> {
    try {
      // Uses dynamic import to avoid top-level fs dependency (works in both Node and edge)
      const fs = await import('node:fs/promises');
      const raw = await fs.readFile(this.filePath(key), 'utf-8');
      return JSON.parse(raw) as SerializedEntry<T>;
    } catch (error) {
      console.warn('[FileSystemStorage] Failed to read entry:', (error as Error).message);
      return undefined;
    }
  }

  private async writeEntry(key: string, entry: SerializedEntry<T>): Promise<void> {
    const fs = await import('node:fs/promises');
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.writeFile(this.filePath(key), JSON.stringify(entry), 'utf-8');
  }

  async get(key: string): Promise<T | undefined> {
    const entry = await this.readEntry(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      await this.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: T): Promise<void> {
    await this.writeEntry(key, {
      key,
      value,
      timestamp: Date.now(),
      ttl: this.ttl,
    });
  }

  async delete(key: string): Promise<boolean> {
    try {
      const fs = await import('node:fs/promises');
      await fs.unlink(this.filePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = await this.readEntry(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      await this.delete(key);
      return false;
    }
    return true;
  }

  async keys(): Promise<string[]> {
    try {
      const fs = await import('node:fs/promises');
      const files = await fs.readdir(this.basePath);
      return files
        .filter((f) => f.endsWith(this.extension))
        .map((f) => f.slice(0, -this.extension.length));
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    const keys = await this.keys();
    for (const key of keys) {
      await this.delete(key);
    }
  }

  async size(): Promise<number> {
    const keys = await this.keys();
    return keys.length;
  }
}
