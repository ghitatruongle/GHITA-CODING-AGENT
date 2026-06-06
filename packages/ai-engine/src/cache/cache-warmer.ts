// ==============================================================================
// GHITA CODING AGENT - Cache Warmer (Phase 26)
// ==============================================================================

import type { CacheWarmerConfig, WarmSource } from './types.js';

const DEFAULT_CONFIG: CacheWarmerConfig = {
  enabled: true,
  topN: 100,
  persistentStorePath: null,
  preloadKeys: [],
};

/**
 * Cache warming on startup.
 * Loads frequently-accessed keys from various sources into the cache
 * to reduce cold-start latency.
 */
export class CacheWarmer<T = unknown> {
  private config: CacheWarmerConfig;
  private sources: WarmSource[] = [];
  private _warmed = false;
  private _warmedCount = 0;
  private _errors: string[] = [];

  constructor(config?: Partial<CacheWarmerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a warm source.
   */
  addSource(source: WarmSource): void {
    this.sources.push(source);
  }

  /**
   * Warm the cache by loading data from all registered sources.
   * Returns the entries to be loaded into the cache.
   */
  async warm(): Promise<Array<{ key: string; value: T; tags?: string[] }>> {
    if (!this.config.enabled) return [];

    const allEntries: Array<{ key: string; value: T; tags?: string[] }> = [];

    // 1. Load from persistent store if configured
    if (this.config.persistentStorePath) {
      try {
        const entries = await this.loadFromPersistentStore(this.config.persistentStorePath);
        allEntries.push(...entries);
      } catch (err) {
        this._errors.push(
          `Persistent store load failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 2. Load from registered warm sources
    for (const source of this.sources) {
      try {
        const entries = await source.load();
        allEntries.push(...entries.map((e) => ({ key: e.key, value: e.value as T, tags: e.tags })));
      } catch (err) {
        this._errors.push(
          `Source "${source.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 3. Add predefined preload keys (with null value — they'll be populated on first real access)
    for (const key of this.config.preloadKeys) {
      if (!allEntries.some((e) => e.key === key)) {
        allEntries.push({ key, value: null as T, tags: ['preload'] });
      }
    }

    // 4. Limit to topN if specified
    const limited = this.config.topN > 0 ? allEntries.slice(0, this.config.topN) : allEntries;

    this._warmed = true;
    this._warmedCount = limited.length;
    return limited;
  }

  /**
   * Create a warm source from an in-memory snapshot.
   */
  static fromSnapshot<T>(name: string, data: Array<{ key: string; value: T; tags?: string[] }>): WarmSource {
    return {
      name,
      load: async () => data.map((d) => ({ key: d.key, value: d.value as unknown, tags: d.tags })),
    };
  }

  /**
   * Create a warm source from a JSON file path.
   */
  static fromJsonFile(name: string, filePath: string): WarmSource {
    return {
      name,
      load: async () => {
        const fs = await import('node:fs/promises');
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content) as Array<{ key: string; value: unknown; tags?: string[] }>;
        return data;
      },
    };
  }

  get warmed(): boolean {
    return this._warmed;
  }

  get warmedCount(): number {
    return this._warmedCount;
  }

  get errors(): string[] {
    return [...this._errors];
  }

  // --- Private ---

  private async loadFromPersistentStore(
    storePath: string,
  ): Promise<Array<{ key: string; value: T; tags?: string[] }>> {
    const fs = await import('node:fs/promises');
    try {
      const content = await fs.readFile(storePath, 'utf-8');
      const parsed = JSON.parse(content) as Array<{
        key: string;
        value: T;
        tags?: string[];
        hitCount?: number;
      }>;
      // Sort by hit count descending and take topN
      parsed.sort((a, b) => (b.hitCount ?? 0) - (a.hitCount ?? 0));
      return parsed.slice(0, this.config.topN).map((e) => ({
        key: e.key,
        value: e.value,
        tags: e.tags,
      }));
    } catch {
      return [];
    }
  }
}
