import type { SkillManifest, CatalogFilters } from './types.js';
import { SkillCatalogClient } from './catalog.js';

// Store types

export interface StoreEntry {
  manifest: SkillManifest;
  /** Cached lower-cased name + description for fast search. */
  searchHaystack: string;
  /** Tag index, lower-cased. */
  tagSet: Set<string>;
  /** Score derived from downloads + rating; recomputed lazily. */
  score: number;
}

export interface PersistedStore {
  version: 1;
  updatedAt: number;
  entries: Array<{ manifest: SkillManifest; score: number }>;
}

export interface PersistAdapter {
  load: () => Promise<PersistedStore | null>;
  save: (data: PersistedStore) => Promise<void>;
}

// Scoring

const DOWNLOAD_WEIGHT = 1.0;
const RATING_WEIGHT = 500;
const RATING_COUNT_WEIGHT = 5;

export function scoreManifest(manifest: SkillManifest): number {
  const downloads = manifest.downloads ?? 0;
  const rating = manifest.rating ?? 0;
  const ratingCount = manifest.ratingCount ?? 0;
  return downloads * DOWNLOAD_WEIGHT + rating * RATING_WEIGHT + ratingCount * RATING_COUNT_WEIGHT;
}

// Store

export class MarketplaceStore {
  private readonly byId = new Map<string, StoreEntry>();
  private readonly client: SkillCatalogClient;
  private readonly persist?: PersistAdapter;
  private hydrated = false;

  constructor(options: { client?: SkillCatalogClient; persist?: PersistAdapter } = {}) {
    this.client = options.client ?? new SkillCatalogClient();
    this.persist = options.persist;
  }

  /**
   * Load the catalog and refresh the in-memory index. Falls back to a
   * previously persisted snapshot if the network call fails.
   */
  async refresh(force = false): Promise<number> {
    if (this.hydrated && !force) return this.byId.size;
    let loaded = 0;
    try {
      const catalog = await this.client.fetchCatalog(1, 1000);
      this.reindex(catalog.skills);
      loaded = this.byId.size;
    } catch {
      const snapshot = await this.persist?.load().catch(() => null);
      if (snapshot) this.reindex(snapshot.entries.map((e) => e.manifest));
      loaded = this.byId.size;
    }
    this.hydrated = true;
    if (this.persist && loaded > 0) await this.persistNow();
    return loaded;
  }

  size(): number {
    return this.byId.size;
  }

  get(id: string): SkillManifest | undefined {
    return this.byId.get(id)?.manifest;
  }

  list(): SkillManifest[] {
    return Array.from(this.byId.values())
      .sort((a, b) => b.score - a.score)
      .map((e) => e.manifest);
  }

  /**
   * Full-text search across name + description + tags with optional filters.
   * Returns up to `limit` results sorted by combined score.
   */
  async search(query: string, filters: CatalogFilters = {}, limit = 25): Promise<SkillManifest[]> {
    if (!this.hydrated) await this.refresh();
    const needle = query.trim().toLowerCase();
    const tagFilters = (filters.tags ?? []).map((t) => t.toLowerCase());

    const matched: Array<{ entry: StoreEntry; matchBoost: number }> = [];
    for (const entry of this.byId.values()) {
      if (filters.category && entry.manifest.category !== filters.category) continue;
      if (
        typeof filters.minRating === 'number' &&
        (entry.manifest.rating ?? 0) < filters.minRating
      ) {
        continue;
      }
      if (tagFilters.length > 0) {
        const allTagsPresent = tagFilters.every((t) => entry.tagSet.has(t));
        if (!allTagsPresent) continue;
      }

      let matchBoost = 0;
      if (needle.length > 0) {
        if (entry.manifest.name.toLowerCase().includes(needle)) matchBoost += 100;
        if (entry.manifest.description.toLowerCase().includes(needle)) matchBoost += 25;
        for (const tag of entry.tagSet) {
          if (tag.includes(needle)) matchBoost += 10;
        }
        if (matchBoost === 0) continue;
      }

      matched.push({ entry, matchBoost });
    }

    const sortBy = filters.sortBy ?? 'downloads';
    return matched
      .sort((a, b) => {
        const scoreDiff = b.entry.score + b.matchBoost - (a.entry.score + a.matchBoost);
        if (scoreDiff !== 0) return scoreDiff;
        if (sortBy === 'name') return a.entry.manifest.name.localeCompare(b.entry.manifest.name);
        if (sortBy === 'newest') return b.entry.manifest.updatedAt - a.entry.manifest.updatedAt;
        if (sortBy === 'rating') return b.entry.manifest.rating - a.entry.manifest.rating;
        return b.entry.manifest.downloads - a.entry.manifest.downloads;
      })
      .slice(0, limit)
      .map(({ entry }) => entry.manifest);
  }

  /**
   * Suggest related skills based on shared tags. Returns up to `limit`
   * candidates excluding the source skill id.
   */
  suggestRelated(skillId: string, limit = 5): SkillManifest[] {
    const source = this.byId.get(skillId);
    if (!source) return [];

    const scored: Array<{ other: StoreEntry; overlap: number }> = [];
    for (const other of this.byId.values()) {
      if (other.manifest.id === skillId) continue;
      let overlap = 0;
      for (const tag of other.tagSet) {
        if (source.tagSet.has(tag)) overlap += 1;
      }
      if (overlap > 0) scored.push({ other, overlap });
    }

    return scored
      .sort((a, b) => {
        if (a.overlap !== b.overlap) return b.overlap - a.overlap;
        return b.other.score - a.other.score;
      })
      .slice(0, limit)
      .map(({ other }) => other.manifest);
  }

  /**
   * Apply a local mutation to a skill (e.g. updated rating or downloads after
   * a successful install). The mutation is reflected immediately and persisted
   * if a `persist` adapter is configured.
   */
  async upsert(manifest: SkillManifest): Promise<void> {
    this.reindex([manifest]);
    if (this.persist) await this.persistNow();
  }

  // Internals
  
  private reindex(manifests: SkillManifest[]): void {
    for (const m of manifests) {
      const tagSet = new Set((m.tags ?? []).map((t) => t.toLowerCase()));
      const haystack = [m.name, m.description, m.author, ...(m.tags ?? [])].join(' ').toLowerCase();
      this.byId.set(m.id, {
        manifest: m,
        searchHaystack: haystack,
        tagSet,
        score: scoreManifest(m),
      });
    }
  }

  private async persistNow(): Promise<void> {
    if (!this.persist) return;
    const data: PersistedStore = {
      version: 1,
      updatedAt: Date.now(),
      entries: Array.from(this.byId.values()).map((e) => ({
        manifest: e.manifest,
        score: e.score,
      })),
    };
    await this.persist.save(data);
  }
}

// Default file-system persistence adapter

import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export class FilePersistAdapter implements PersistAdapter {
  private readonly path: string;
  constructor(path?: string) {
    this.path = path ?? join(homedir(), '.ghita', 'skills', 'marketplace.json');
  }

  async load(): Promise<PersistedStore | null> {
    try {
      const raw = await readFile(this.path, 'utf8');
      return JSON.parse(raw) as PersistedStore;
    } catch {
      return null;
    }
  }

  async save(data: PersistedStore): Promise<void> {
    await mkdir(this.path.split(/[\\/]/).slice(0, -1).join('/'), { recursive: true });
    await writeFile(this.path, JSON.stringify(data, null, 2), 'utf8');
  }
}
