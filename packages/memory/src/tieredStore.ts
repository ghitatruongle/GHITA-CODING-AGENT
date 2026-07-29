// ==============================================================================
// GHITA CODING AGENT - Phase 15: AgentMemory Tiered Storage
// ==============================================================================

import type { MemoryEntry, MemorySearchResult } from '@ghita/shared';
import { RustMemoryAddon } from './semantic/rustAddon.js';
import {
  reinforceMetadata,
  effectiveStrength,
  type ReinforcementOptions,
} from './reinforcement.js';

export interface TieredMemoryStoreConfig {
  dbPath?: string;
  maxWorkingMemorySize?: number;
  promotionAccessThreshold?: number;
  promotionImportanceThreshold?: number;
}

// ---------------------------------------------------------------------------
// Database interface and bindings helper
// ---------------------------------------------------------------------------
type StatementResultLike = { changes?: number };
type StatementLike = {
  run: (...args: unknown[]) => StatementResultLike;
  all: (...args: unknown[]) => unknown[];
  get: (...args: unknown[]) => unknown;
};
type DatabaseLike = {
  exec: (sql: string) => void;
  prepare: (sql: string) => StatementLike;
  close: () => void;
};

declare const require: ((id: string) => unknown) | undefined;
const runtimeRequire: ((id: string) => unknown) | null =
  typeof require !== 'undefined' ? require : null;

// ---------------------------------------------------------------------------
// Helper functions for mock embeddings
// ---------------------------------------------------------------------------
export function getDeterministicMockEmbedding(text: string, dimensions = 1536): number[] {
  const vector = new Array(dimensions).fill(0);
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = (seed * 31 + text.charCodeAt(i)) | 0;
  }

  let r = seed;
  for (let i = 0; i < dimensions; i++) {
    r = (r * 1664525 + 1013904223) | 0;
    vector[i] = r / 2147483648; // scale to [-1, 1]
  }

  let sumSq = 0;
  for (const val of vector) {
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] /= norm;
    }
  }
  return vector;
}

export class TieredMemoryStore {
  // Tier 1: Working Memory (in-process Map)
  private readonly workingMemory = new Map<string, MemoryEntry>();

  // Tier 2: SQLite database handle
  private db: DatabaseLike | null = null;
  private isFallbackDb = true;
  private mockDbEntries: MemoryEntry[] = [];

  // Tier 3: Long-term Vector store (RustMemoryAddon wrapper)
  private readonly vectorStore: RustMemoryAddon;

  private readonly config: Required<TieredMemoryStoreConfig>;

  constructor(config?: TieredMemoryStoreConfig) {
    this.config = {
      dbPath: config?.dbPath ?? ':memory:',
      maxWorkingMemorySize: config?.maxWorkingMemorySize ?? 50,
      promotionAccessThreshold: config?.promotionAccessThreshold ?? 5,
      promotionImportanceThreshold: config?.promotionImportanceThreshold ?? 0.7,
    };

    this.initDatabase(this.config.dbPath);

    // Initialize Tier 3 Vector store using RustMemoryAddon with a separate in-memory or file DB
    this.vectorStore = new RustMemoryAddon({
      dbPath: this.config.dbPath === ':memory:' ? ':memory:' : `${this.config.dbPath}.vector`,
    });
  }

  private initDatabase(dbPath: string): void {
    try {
      if (!runtimeRequire) throw new Error('require not available');
      const DatabaseCtor = runtimeRequire('better-sqlite3') as new (p: string) => DatabaseLike;
      if (DatabaseCtor) {
        this.db = new DatabaseCtor(dbPath);
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS tiered_memories (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            metadata TEXT
          );
        `);
        this.isFallbackDb = false;
      }
    } catch {
      this.isFallbackDb = true;
      this.mockDbEntries = [];
    }
  }

  /**
   * Calculates a utility score for cache eviction using LRU (recency), access count (frequency), and importance
   */
  private calculateUtilityScore(entry: MemoryEntry, now: number): number {
    const metadata = entry.metadata ?? {};
    const importance =
      typeof metadata['_importance'] === 'number' ? (metadata['_importance'] as number) : 0.5;
    const accessCount =
      typeof metadata['_accessCount'] === 'number' ? (metadata['_accessCount'] as number) : 0;
    const lastAccessed =
      typeof metadata['_lastAccessed'] === 'number'
        ? (metadata['_lastAccessed'] as number)
        : entry.timestamp;

    // Recency decay: half-life of 1 hour for quick eviction of inactive working memories
    const ageMs = Math.max(0, now - lastAccessed);
    const recency = Math.pow(0.5, ageMs / (1000 * 60 * 60));

    // Frequency factor (normalized to range [0, 1])
    const frequency = Math.min(1, accessCount / 10);

    return importance * 0.5 + recency * 0.3 + frequency * 0.2;
  }

  /**
   * Promotes an entry to Tier 1 and triggers eviction if capacity is exceeded
   */
  private promoteToTier1(entry: MemoryEntry): void {
    const now = Date.now();
    const metadata = { ...(entry.metadata ?? {}) };

    // Update access metrics
    const currentAccessCount =
      typeof metadata['_accessCount'] === 'number' ? (metadata['_accessCount'] as number) : 0;
    metadata['_accessCount'] = currentAccessCount + 1;
    metadata['_lastAccessed'] = now;

    // Check if importance is not set yet
    if (typeof metadata['_importance'] !== 'number') {
      metadata['_importance'] = 0.5; // default importance
    }

    const updatedEntry: MemoryEntry = {
      ...entry,
      metadata,
    };

    // Store in Tier 1
    this.workingMemory.set(updatedEntry.id, updatedEntry);

    // Promote to Tier 3 Vector DB if promotion criteria are met
    const importanceVal = metadata['_importance'] as number;
    const accessCountVal = metadata['_accessCount'] as number;

    if (
      importanceVal >= this.config.promotionImportanceThreshold ||
      accessCountVal >= this.config.promotionAccessThreshold
    ) {
      this.promoteToTier3(updatedEntry);
    }

    // Enforce Tier 1 Capacity
    if (this.workingMemory.size > this.config.maxWorkingMemorySize) {
      this.evictWorkingMemory();
    }
  }

  /**
   * Evicts the lowest-utility entry from Tier 1 and demotes it to Tier 2
   */
  private evictWorkingMemory(): void {
    const now = Date.now();
    let lowestScore = Infinity;
    let lowestEntry: MemoryEntry | null = null;

    for (const entry of this.workingMemory.values()) {
      const score = this.calculateUtilityScore(entry, now);
      if (score < lowestScore) {
        lowestScore = score;
        lowestEntry = entry;
      }
    }

    if (lowestEntry) {
      // Demote to Tier 2 (SQLite)
      this.demoteToTier2(lowestEntry);
      // Remove from Tier 1
      this.workingMemory.delete(lowestEntry.id);
    }
  }

  /**
   * Writes the entry to Tier 2 (Session Store - SQLite)
   */
  private demoteToTier2(entry: MemoryEntry): void {
    if (!this.isFallbackDb && this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO tiered_memories (id, type, content, timestamp, metadata)
          VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(
          entry.id,
          entry.type,
          entry.content,
          entry.timestamp,
          JSON.stringify(entry.metadata ?? {}),
        );
      } catch (err) {
        console.warn('[TieredStore] SQLite demote failed, falling back to mock:', err);
        this.writeToMockDb(entry);
      }
    } else {
      this.writeToMockDb(entry);
    }
  }

  private writeToMockDb(entry: MemoryEntry): void {
    const idx = this.mockDbEntries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      this.mockDbEntries[idx] = entry;
    } else {
      this.mockDbEntries.push(entry);
    }
  }

  /**
   * Writes the entry to Tier 3 (Long-term Store - Vector index)
   */
  private promoteToTier3(entry: MemoryEntry): void {
    const vector = getDeterministicMockEmbedding(entry.content);
    this.vectorStore.storeEmbedding({
      id: entry.id,
      vector,
      content: entry.content,
      sessionId: (entry.metadata?.sessionId as string) ?? 'default_session',
      timestamp: entry.timestamp,
      metadata: entry.metadata,
    });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Adds or updates a memory entry. Starts at Tier 1.
   */
  add(entry: MemoryEntry): MemoryEntry {
    const entryCopy = { ...entry };
    if (!entryCopy.metadata) {
      entryCopy.metadata = {};
    }

    this.promoteToTier1(entryCopy);
    return entryCopy;
  }

  /**
   * v0.4.9 A9: Reinforce a memory (AgentMemory-style). Decays the current
   * strength to now, then boosts it with diminishing returns, and records the
   * reinforcement time. Returns the new effective strength, or undefined when
   * the memory is not present in working memory.
   */
  reinforce(id: string, options?: ReinforcementOptions): number | undefined {
    const entry = this.workingMemory.get(id);
    if (!entry) return undefined;
    const now = Date.now();
    const metadata = reinforceMetadata(entry.metadata ?? {}, now, options);
    this.workingMemory.set(id, { ...entry, metadata });
    return metadata['_strength'] as number;
  }

  /**
   * v0.4.9 A9: Read a memory's current strength decayed to now (0 when the
   * memory has never been reinforced or is not in working memory).
   */
  getStrength(id: string, options?: ReinforcementOptions): number {
    const entry = this.workingMemory.get(id);
    if (!entry) return 0;
    const metadata = entry.metadata ?? {};
    const stored =
      typeof metadata['_strength'] === 'number' ? (metadata['_strength'] as number) : 0;
    const lastReinforced =
      typeof metadata['_lastReinforced'] === 'number'
        ? (metadata['_lastReinforced'] as number)
        : entry.timestamp;
    return effectiveStrength(stored, lastReinforced, Date.now(), options);
  }

  /**
   * Retrieves an entry by ID. If found in Tier 2/3 but not Tier 1, it promotes it.
   */
  get(id: string): MemoryEntry | undefined {
    // Check Tier 1 (Working Memory)
    let entry = this.workingMemory.get(id);
    if (entry) {
      // In-place update to refresh access count
      this.promoteToTier1(entry);
      return this.workingMemory.get(id);
    }

    // Check Tier 2 (Session Store)
    if (!this.isFallbackDb && this.db) {
      try {
        const stmt = this.db.prepare('SELECT * FROM tiered_memories WHERE id = ?');
        const row = stmt.get(id) as
          | { id: string; type: string; content: string; timestamp: number; metadata: string }
          | undefined;
        if (row) {
          entry = {
            id: row.id,
            type: row.type as MemoryEntry['type'],
            content: row.content,
            timestamp: row.timestamp,
            metadata: JSON.parse(row.metadata || '{}'),
          };
        }
      } catch (err) {
        console.warn('[TieredStore] SQLite read failed:', err);
      }
    } else {
      entry = this.mockDbEntries.find((e) => e.id === id);
    }

    if (entry) {
      this.promoteToTier1(entry);
      return entry;
    }

    // Check Tier 3 (Long-term Store)
    //
    // MEMORY (audit fix 2.16): the previous implementation called
    //   `vectorStore.searchByVector(emptyVec, { limit: 1000 })`
    // and filtered results by id. This silently dropped any entry past
    // index 1000 in the HNSW / brute-force index. Use the new O(1)
    // `getEmbedding()` instead.
    const vecEntry = this.vectorStore.getEmbedding(id);

    if (vecEntry) {
      entry = {
        id: vecEntry.id,
        type: (vecEntry.metadata?.type as MemoryEntry['type']) ?? 'fact',
        content: vecEntry.content,
        timestamp: vecEntry.timestamp,
        metadata: vecEntry.metadata,
      };
      this.promoteToTier1(entry);
      return entry;
    }

    return undefined;
  }

  /**
   * Forgets (deletes) a memory from all tiers
   */
  forget(id: string): boolean {
    let deleted = this.workingMemory.delete(id);

    // Delete from Tier 2
    if (!this.isFallbackDb && this.db) {
      try {
        const stmt = this.db.prepare('DELETE FROM tiered_memories WHERE id = ?');
        const info = stmt.run(id);
        if (info.changes && info.changes > 0) {
          deleted = true;
        }
      } catch {
        /* ignore */
      }
    } else {
      const idx = this.mockDbEntries.findIndex((e) => e.id === id);
      if (idx >= 0) {
        this.mockDbEntries.splice(idx, 1);
        deleted = true;
      }
    }

    // Delete from Tier 3
    if (this.vectorStore.removeEmbedding(id)) {
      deleted = true;
    }

    return deleted;
  }

  /**
   * Clears all tiers
   */
  clear(): void {
    this.workingMemory.clear();

    if (!this.isFallbackDb && this.db) {
      try {
        this.db.exec('DELETE FROM tiered_memories');
      } catch {
        /* ignore */
      }
    } else {
      this.mockDbEntries = [];
    }

    this.vectorStore.clearDatabase();
  }

  /**
   * Lists all memories across tiers, sorted by timestamp descending
   */
  list(type?: MemoryEntry['type']): MemoryEntry[] {
    const allMap = new Map<string, MemoryEntry>();

    // Load from Tier 3
    // Since we don't have direct list in vectorStore, search all (high similarity filter disabled)
    const vecResults = this.vectorStore.searchByVector(new Array(1536).fill(0), {
      limit: 10000,
      minScore: -1,
    });
    for (const res of vecResults) {
      const entry: MemoryEntry = {
        id: res.entry.id,
        type: (res.entry.metadata?.type as MemoryEntry['type']) ?? 'fact',
        content: res.entry.content,
        timestamp: res.entry.timestamp,
        metadata: res.entry.metadata,
      };
      if (!type || entry.type === type) {
        allMap.set(entry.id, entry);
      }
    }

    // Load from Tier 2 (Session Store - SQLite)
    if (!this.isFallbackDb && this.db) {
      try {
        const query = type
          ? 'SELECT * FROM tiered_memories WHERE type = ?'
          : 'SELECT * FROM tiered_memories';
        const stmt = this.db.prepare(query);
        const rows = type ? stmt.all(type) : stmt.all();
        for (const row of rows as Array<{
          id: string;
          type: string;
          content: string;
          timestamp: number;
          metadata: string;
        }>) {
          allMap.set(row.id, {
            id: row.id,
            type: row.type as MemoryEntry['type'],
            content: row.content,
            timestamp: row.timestamp,
            metadata: JSON.parse(row.metadata || '{}'),
          });
        }
      } catch (err) {
        console.warn('[TieredStore] SQLite list failed, falling back to mock:', err);
      }
    } else {
      const filteredMocks = type
        ? this.mockDbEntries.filter((e) => e.type === type)
        : this.mockDbEntries;
      for (const e of filteredMocks) {
        allMap.set(e.id, e);
      }
    }

    // Load from Tier 1 (Working Memory)
    const filteredT1 = type
      ? [...this.workingMemory.values()].filter((e) => e.type === type)
      : [...this.workingMemory.values()];
    for (const e of filteredT1) {
      allMap.set(e.id, e);
    }

    return [...allMap.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Performs a tiered search.
   * Search process:
   * 1. Query Tier 1.
   * 2. Query Tier 2 (SQLite like matching).
   * 3. Query Tier 3 (Semantic search).
   * 4. Merge results and sort by composite score + similarity.
   */
  search(
    query: string,
    options: {
      limit?: number;
      type?: MemoryEntry['type'];
      minScore?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ): MemorySearchResult[] {
    const limit = options.limit ?? 5;
    const minScore = options.minScore ?? 0.05;
    const now = Date.now();

    // 1. Gather all candidates from all tiers
    const candidates = new Map<string, MemoryEntry>();

    // Scan Tier 1
    for (const entry of this.workingMemory.values()) {
      if (options.type && entry.type !== options.type) continue;
      candidates.set(entry.id, entry);
    }

    // Scan Tier 2 (SQLite search)
    if (!this.isFallbackDb && this.db) {
      try {
        const baseQuery = 'SELECT * FROM tiered_memories WHERE content LIKE ?';
        const stmt = this.db.prepare(baseQuery);
        const rows = stmt.all(`%${query}%`) as Array<{
          id: string;
          type: string;
          content: string;
          timestamp: number;
          metadata: string;
        }>;
        for (const row of rows) {
          const entry: MemoryEntry = {
            id: row.id,
            type: row.type as MemoryEntry['type'],
            content: row.content,
            timestamp: row.timestamp,
            metadata: JSON.parse(row.metadata || '{}'),
          };
          if (options.type && entry.type !== options.type) continue;
          candidates.set(entry.id, entry);
        }
      } catch (err) {
        console.warn('[TieredStore] SQLite search failed:', err);
      }
    } else {
      const lowercaseQuery = query.toLowerCase();
      const mockMatches = this.mockDbEntries.filter((e) =>
        e.content.toLowerCase().includes(lowercaseQuery),
      );
      for (const entry of mockMatches) {
        if (options.type && entry.type !== options.type) continue;
        candidates.set(entry.id, entry);
      }
    }

    // Scan Tier 3 (Semantic search via RustMemoryAddon)
    const queryVector = getDeterministicMockEmbedding(query);
    const semanticMatches = this.vectorStore.searchByVector(queryVector, {
      limit: limit * 2,
      minScore: 0.1,
    });
    for (const match of semanticMatches) {
      const entry: MemoryEntry = {
        id: match.entry.id,
        type: (match.entry.metadata?.type as MemoryEntry['type']) ?? 'fact',
        content: match.entry.content,
        timestamp: match.entry.timestamp,
        metadata: match.entry.metadata,
      };
      if (options.type && entry.type !== options.type) continue;
      candidates.set(entry.id, entry);
    }

    // 2. Score candidates
    const TOKEN_PATTERN = /[\p{L}\p{N}_-]+/gu;
    const tokenize = (val: string): Set<string> => {
      const matches = val.toLowerCase().match(TOKEN_PATTERN) ?? [];
      return new Set(matches.filter((t) => t.length > 1));
    };

    const queryTokens = tokenize(query);

    const scoreEntry = (entry: MemoryEntry): number => {
      const entryTokens = tokenize(entry.content);
      if (queryTokens.size === 0 || entryTokens.size === 0) return 0;

      let matches = 0;
      for (const token of queryTokens) {
        if (entryTokens.has(token)) matches += 1;
      }

      const tokenScore = matches / queryTokens.size;
      const ageMs = Math.max(0, now - entry.timestamp);
      const recencyScore = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 30));
      const explicitRelevance = entry.relevance ?? 0;

      return tokenScore * 0.7 + recencyScore * 0.2 + explicitRelevance * 0.1;
    };

    const results: MemorySearchResult[] = [];
    for (const entry of candidates.values()) {
      // Metadata matching filter
      if (options.metadata) {
        let match = true;
        for (const [k, v] of Object.entries(options.metadata)) {
          if (!entry.metadata || entry.metadata[k] !== v) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }

      const score = scoreEntry(entry);
      if (score >= minScore) {
        results.push({
          entry: { ...entry, relevance: score },
          score,
        });
      }
    }

    // Promote search results back to Tier 1 if accessed
    const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, limit);
    for (const res of sortedResults) {
      this.promoteToTier1(res.entry);
    }

    return sortedResults;
  }

  // Helper for tests to query status of working memory size
  getWorkingMemorySize(): number {
    return this.workingMemory.size;
  }

  // Helper for tests to see database contents directly
  getDatabaseCount(): number {
    if (!this.isFallbackDb && this.db) {
      try {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM tiered_memories');
        const res = stmt.get() as { count: number } | undefined;
        return res?.count ?? 0;
      } catch {
        return this.mockDbEntries.length;
      }
    }
    return this.mockDbEntries.length;
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        /* ignore */
      }
      this.db = null;
    }
    this.vectorStore.close();
  }
}
