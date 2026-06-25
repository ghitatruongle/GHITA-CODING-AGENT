// ==============================================================================
// GHITA CODING AGENT - Phase 14: Rust Semantic Memory Addon (Enhanced)
// ==============================================================================
// SQLite FTS5 full-text indexer + Rust cosine similarity addon with:
// - FTS5 virtual table for instant keyword search
// - Cosine similarity via Rust N-API or JS fallback
// - LRU RAM cache (capped at configurable max, default 100MB)
// - Vector embedding index for semantic nearest-neighbor search
// - Hybrid search combining FTS5 + vector similarity
// - Auto-vacuum & old-log purge (configurable retention)
// - Statistics tracking for observability
// ==============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatLogEntry {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  symbol_attached?: string;
}

export interface CacheEntry {
  key: string;
  vector: number[];
  lruIndex: number;
  sizeBytes: number;
}

export interface RustAddonConfig {
  /** Path to the SQLite database file (default: ':memory:') */
  dbPath?: string;
  /** Maximum RAM cache size in bytes (default: 100MB) */
  maxCacheSizeBytes?: number;
  /** Enable FTS5 virtual table (default: true) */
  enableFts5?: boolean;
  /** Number of writes between auto-vacuum runs (default: 1000) */
  vacuumIntervalWrites?: number;
  /** Default number of days to retain logs (default: 30) */
  retentionDays?: number;
  /** Maximum number of stored embedding vectors (default: 50000) */
  maxVectorEntries?: number;
}

export interface VectorEntry {
  /** Unique identifier */
  id: string;
  /** Embedding vector */
  vector: number[];
  /** Associated text content */
  content: string;
  /** Session the entry belongs to */
  sessionId: string;
  /** Creation timestamp */
  timestamp: number;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

export interface SemanticSearchResult {
  /** Matching vector entry */
  entry: VectorEntry;
  /** Cosine similarity score (0..1) */
  score: number;
}

export interface HybridSearchResult {
  /** Entry ID */
  id: string;
  /** Original content */
  content: string;
  /** Session ID */
  sessionId: string;
  /** FTS5 keyword score (0..1) */
  ftsScore: number;
  /** Vector similarity score (0..1) */
  vectorScore: number;
  /** Combined hybrid score */
  hybridScore: number;
  /** Timestamp */
  timestamp: number;
}

export interface AddonStats {
  totalIndexed: number;
  totalSearches: number;
  totalVacuums: number;
  totalPurges: number;
  cacheHits: number;
  cacheMisses: number;
  vectorEntries: number;
  fallbackDbActive: boolean;
}

// ---------------------------------------------------------------------------
// Internal type abstractions for SQLite
// ---------------------------------------------------------------------------

type StatementResultLike = { changes?: number };
type StatementLike = {
  run: (...args: unknown[]) => StatementResultLike;
  all: (...args: unknown[]) => unknown[];
};
type DatabaseLike = {
  exec: (sql: string) => void;
  prepare: (sql: string) => StatementLike;
  transaction: <T>(fn: (items: T) => void) => (items: T) => void;
  close: () => void;
};

/** HNSW index interface matching the Rust NAPI HnswIndex class */
interface HnswIndexLike {
  add(id: string, vector: number[]): void;
  addBatch(entries: Array<{ id: string; vector: number[] }>): void;
  search(query: number[], topK: number, efSearch?: number): Array<{ id: string; score: number }>;
  remove(id: string): boolean;
  size(): number;
  clear(): void;
}

type RustBindingsLike = {
  cosineSimilarity?: (a: number[], b: number[]) => number;
  batchCosineSimilarity?: (query: number[], candidates: number[][]) => number[];
  batchDecayScore?: (timestamps: number[], halfLifeMs: number, now: number) => number[];
  HnswIndex?: new (dim: number, m?: number, efConstruction?: number) => HnswIndexLike;
};

declare const require: ((id: string) => unknown) | undefined;
const runtimeRequire: ((id: string) => unknown) | null =
  typeof require !== 'undefined' ? require : null;

// ---------------------------------------------------------------------------
// Shared cosine similarity (standalone, usable by all modules)
// ---------------------------------------------------------------------------

/**
 * Pure-JS cosine similarity between two vectors.
 * Used as the canonical fallback across the memory package.
 * Handles unequal lengths (uses min), zero-norm (returns 0), empty (returns 0).
 */
export function cosineSimilarityJS(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < length; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// RustMemoryAddon
// ---------------------------------------------------------------------------

export class RustMemoryAddon {
  private db: DatabaseLike | null = null;
  private isFallbackDb = true;
  private mockDbLogs: ChatLogEntry[] = [];

  private writeCounter = 0;
  private lruCounter = 0;
  private readonly ramCache = new Map<string, CacheEntry>();
  private ramCacheSizeBytes = 0;

  /** Configuration */
  private readonly config: Required<RustAddonConfig>;

  /** Vector embedding index */
  private readonly vectorIndex = new Map<string, VectorEntry>();

  /** Rust N-API bindings (null if unavailable) */
  private rustBindings: RustBindingsLike | null = null;

  /** HNSW approximate nearest-neighbor index (null if Rust bindings unavailable) */
  private hnswIndex: HnswIndexLike | null = null;

  /** Dimension of the first stored vector (used to lazily init HNSW) */
  private hnswDim: number | null = null;

  /** Statistics counters */
  private readonly stats: AddonStats = {
    totalIndexed: 0,
    totalSearches: 0,
    totalVacuums: 0,
    totalPurges: 0,
    cacheHits: 0,
    cacheMisses: 0,
    vectorEntries: 0,
    fallbackDbActive: false,
  };

  constructor(config?: RustAddonConfig | string) {
    const isString = typeof config === 'string';
    const configObj = isString ? undefined : config;

    this.config = {
      dbPath: isString ? config : (configObj?.dbPath ?? ':memory:'),
      maxCacheSizeBytes: configObj?.maxCacheSizeBytes ?? 100 * 1024 * 1024,
      enableFts5: configObj?.enableFts5 ?? true,
      vacuumIntervalWrites: configObj?.vacuumIntervalWrites ?? 10,
      retentionDays: configObj?.retentionDays ?? 30,
      maxVectorEntries: configObj?.maxVectorEntries ?? 50_000,
    };

    this.initDatabase(this.config.dbPath);
    this.initRustBindings();
    this.stats.fallbackDbActive = this.isFallbackDb;
  }

  // -----------------------------------------------------------------------
  // Database initialization
  // -----------------------------------------------------------------------

  private initDatabase(dbPath: string): void {
    try {
      if (!runtimeRequire) throw new Error('require not available');
      const DatabaseCtor = runtimeRequire('better-sqlite3') as new (p: string) => DatabaseLike;
      if (DatabaseCtor) {
        this.db = new DatabaseCtor(dbPath);

        this.db.exec(`
          CREATE TABLE IF NOT EXISTS old_chats (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            symbol_attached TEXT
          );
        `);

        if (this.config.enableFts5) {
          this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS old_chats_fts USING fts5(
              id UNINDEXED, session_id UNINDEXED, role UNINDEXED,
              content, timestamp UNINDEXED
            );
          `);
        }

        this.isFallbackDb = false;
      }
    } catch {
      this.isFallbackDb = true;
      this.mockDbLogs = [];
    }
  }

  private initRustBindings(): void {
    try {
      if (!runtimeRequire) {
        this.rustBindings = null;
        return;
      }
      this.rustBindings = runtimeRequire('./rust/index.node') as RustBindingsLike;
    } catch {
      this.rustBindings = null;
    }
  }

  /** Lazily create the HNSW index once we know the vector dimension */
  private ensureHnswIndex(dim: number): void {
    if (this.hnswIndex) return;
    if (!this.rustBindings?.HnswIndex) return;
    this.hnswDim = dim;
    this.hnswIndex = new this.rustBindings.HnswIndex(dim, 16, 200);
  }

  /** Rebuild HNSW from scratch (e.g. after bulk eviction) */
  rebuildHnswIndex(): void {
    if (!this.rustBindings?.HnswIndex || this.hnswDim === null) return;
    this.hnswIndex = new this.rustBindings.HnswIndex(this.hnswDim, 16, 200);
    for (const entry of this.vectorIndex.values()) {
      this.hnswIndex.add(entry.id, entry.vector);
    }
  }

  // -----------------------------------------------------------------------
  // Chat log indexing
  // -----------------------------------------------------------------------

  /** Insert or update a single chat message in both relational and FTS5 tables */
  async indexChatMessage(msg: ChatLogEntry): Promise<void> {
    if (!this.isFallbackDb && this.db) {
      const stmt1 = this.db.prepare(`
        INSERT OR REPLACE INTO old_chats (id, session_id, role, content, timestamp, symbol_attached)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt1.run(
        msg.id,
        msg.session_id,
        msg.role,
        msg.content,
        msg.timestamp,
        msg.symbol_attached ?? null,
      );

      if (this.config.enableFts5) {
        const delFts = this.db.prepare('DELETE FROM old_chats_fts WHERE id = ?');
        delFts.run(msg.id);
        const stmt2 = this.db.prepare(`
          INSERT INTO old_chats_fts (id, session_id, role, content, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `);
        stmt2.run(msg.id, msg.session_id, msg.role, msg.content, msg.timestamp);
      }
    } else {
      const idx = this.mockDbLogs.findIndex((l) => l.id === msg.id);
      if (idx >= 0) this.mockDbLogs[idx] = msg;
      else this.mockDbLogs.push(msg);
    }

    this.stats.totalIndexed++;
    this.writeCounter++;
    if (this.writeCounter % this.config.vacuumIntervalWrites === 0) {
      await this.autoVacuum();
    }
  }

  /** Batch-index many messages in a single transaction */
  async indexManyMessages(msgs: ChatLogEntry[]): Promise<void> {
    if (!this.isFallbackDb && this.db) {
      const db = this.db;
      const insert = db.transaction((items: ChatLogEntry[]) => {
        const stmt1 = db.prepare(`
          INSERT OR REPLACE INTO old_chats (id, session_id, role, content, timestamp, symbol_attached)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const delFts = db.prepare('DELETE FROM old_chats_fts WHERE id = ?');
        const stmt2 = db.prepare(`
          INSERT INTO old_chats_fts (id, session_id, role, content, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of items) {
          stmt1.run(
            item.id,
            item.session_id,
            item.role,
            item.content,
            item.timestamp,
            item.symbol_attached ?? null,
          );
          if (this.config.enableFts5) {
            delFts.run(item.id);
            stmt2.run(item.id, item.session_id, item.role, item.content, item.timestamp);
          }
        }
      });
      insert(msgs);
    } else {
      for (const item of msgs) await this.indexChatMessage(item);
    }
    this.stats.totalIndexed += msgs.length;
  }

  // -----------------------------------------------------------------------
  // FTS5 keyword search
  // -----------------------------------------------------------------------

  /** Full-text search using FTS5 or fallback token matching */
  async searchFTS5(query: string, limit = 10): Promise<ChatLogEntry[]> {
    this.stats.totalSearches++;

    if (!this.isFallbackDb && this.db) {
      try {
        // Escape FTS5 special characters and wrap each token in double quotes
        // Use Unicode-aware regex to preserve non-ASCII letters (e.g. Vietnamese, CJK, Cyrillic)
        const safeFtsQuery = query
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .filter((t) => t.length > 0)
          .map((t) => `"${t.replace(/"/g, '""')}"`)
          .join(' ');
        if (!safeFtsQuery) {
          return [];
        }
        const stmt = this.db.prepare(`
          SELECT c.id, c.session_id, c.role, c.content, c.timestamp, c.symbol_attached
          FROM old_chats_fts f
          JOIN old_chats c ON f.id = c.id
          WHERE old_chats_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
        return stmt.all(safeFtsQuery, limit) as ChatLogEntry[];
      } catch {
        // Escape LIKE wildcards in user query
        const safeLike = query.replace(/[%_\\]/g, (c) => `\\${c}`);
        const stmt = this.db.prepare(`
          SELECT id, session_id, role, content, timestamp, symbol_attached
          FROM old_chats WHERE content LIKE ? ESCAPE '\\'
          ORDER BY timestamp DESC LIMIT ?
        `);
        return stmt.all(`%${safeLike}%`, limit) as ChatLogEntry[];
      }
    }

    // Fallback: token matching
    const queryTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    if (queryTokens.length === 0) return [];

    return this.mockDbLogs
      .map((log) => {
        let score = 0;
        const lc = log.content.toLowerCase();
        for (const t of queryTokens) if (lc.includes(t)) score++;
        return { log, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.log.timestamp - a.log.timestamp)
      .map((x) => x.log)
      .slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Vector embedding index (Phase 14)
  // -----------------------------------------------------------------------

  /** Store a vector embedding in the index */
  storeEmbedding(entry: VectorEntry): void {
    // Evict oldest if at capacity
    if (this.vectorIndex.size >= this.config.maxVectorEntries && !this.vectorIndex.has(entry.id)) {
      const oldestId = this.getOldestVectorId();
      if (oldestId) {
        this.vectorIndex.delete(oldestId);
        this.hnswIndex?.remove(oldestId);
      }
    }

    this.vectorIndex.set(entry.id, entry);
    this.stats.vectorEntries = this.vectorIndex.size;

    // Add to HNSW index
    this.ensureHnswIndex(entry.vector.length);
    this.hnswIndex?.add(entry.id, entry.vector);
  }

  /** Store multiple embeddings at once */
  storeEmbeddings(entries: VectorEntry[]): void {
    if (entries.length === 0) return;

    // Use batch add for HNSW when available
    const batchEntries: Array<{ id: string; vector: number[] }> = [];
    for (const entry of entries) {
      if (
        this.vectorIndex.size >= this.config.maxVectorEntries &&
        !this.vectorIndex.has(entry.id)
      ) {
        const oldestId = this.getOldestVectorId();
        if (oldestId) {
          this.vectorIndex.delete(oldestId);
          this.hnswIndex?.remove(oldestId);
        }
      }
      this.vectorIndex.set(entry.id, entry);
      batchEntries.push({ id: entry.id, vector: entry.vector });
    }
    this.stats.vectorEntries = this.vectorIndex.size;

    if (entries.length > 0) {
      this.ensureHnswIndex(entries[0]?.vector?.length ?? 0);
    }
    if (this.hnswIndex && batchEntries.length > 0) {
      this.hnswIndex.addBatch(batchEntries);
    }
  }

  /** Remove an embedding from the index */
  removeEmbedding(id: string): boolean {
    const removed = this.vectorIndex.delete(id);
    if (removed) {
      this.stats.vectorEntries = this.vectorIndex.size;
      this.hnswIndex?.remove(id);
    }
    return removed;
  }

  /**
   * Direct O(1) lookup by id. The previous `get()` codepath in tieredStore
   * abused `searchByVector` with a fake empty vector and a `limit: 1000`
   * (audit issue 2.16) — records past index 1000 were silently dropped.
   * Callers should now use this method for ID-keyed access.
   */
  getEmbedding(id: string): VectorEntry | undefined {
    return this.vectorIndex.get(id);
  }

  /** Semantic nearest-neighbor search using cosine similarity */
  searchByVector(
    queryVector: number[],
    options: { limit?: number; minScore?: number; sessionId?: string; efSearch?: number } = {},
  ): SemanticSearchResult[] {
    const limit = options.limit ?? 10;
    const minScore = options.minScore ?? 0.3;

    // HNSW fast path (no sessionId filter — HNSW doesn't support metadata filtering)
    if (this.hnswIndex && !options.sessionId) {
      const efSearch = options.efSearch ?? Math.max(50, limit * 3);
      const hnswResults = this.hnswIndex.search(queryVector, limit * 2, efSearch);
      const scored: SemanticSearchResult[] = [];
      for (const { id, score } of hnswResults) {
        if (score < minScore) continue;
        const entry = this.vectorIndex.get(id);
        if (entry) scored.push({ entry, score });
      }
      return scored.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    // Brute-force fallback (with optional sessionId filter)
    const scored: SemanticSearchResult[] = [];

    for (const entry of this.vectorIndex.values()) {
      if (options.sessionId && entry.sessionId !== options.sessionId) continue;

      const score = this.cosineSimilarity(queryVector, entry.vector);
      if (score >= minScore) {
        scored.push({ entry, score });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Batch semantic search: multiple query vectors at once */
  batchSearchByVector(
    queryVectors: number[][],
    options: { limit?: number; minScore?: number; sessionId?: string } = {},
  ): SemanticSearchResult[][] {
    // Use Rust batch_cosine_similarity for speed when no sessionId filter
    if (
      this.rustBindings?.batchCosineSimilarity &&
      !options.sessionId &&
      this.vectorIndex.size > 0
    ) {
      const limit = options.limit ?? 10;
      const minScore = options.minScore ?? 0.3;
      const allEntries = Array.from(this.vectorIndex.values());
      const candidateVectors = allEntries.map((e) => e.vector);

      const batchCosine = this.rustBindings.batchCosineSimilarity;
      return queryVectors.map((qv) => {
        const scores = batchCosine(qv, candidateVectors);
        const results: SemanticSearchResult[] = [];
        for (let i = 0; i < scores.length; i++) {
          const s = scores[i] ?? 0;
          if (s >= minScore) {
            const entry = allEntries[i];
            if (entry) results.push({ entry, score: s });
          }
        }
        return results.sort((a, b) => b.score - a.score).slice(0, limit);
      });
    }
    return queryVectors.map((v) => this.searchByVector(v, options));
  }

  private getOldestVectorId(): string | undefined {
    let oldestId: string | undefined;
    let oldestTs = Infinity;
    for (const [id, entry] of this.vectorIndex) {
      if (entry.timestamp < oldestTs) {
        oldestTs = entry.timestamp;
        oldestId = id;
      }
    }
    return oldestId;
  }

  // -----------------------------------------------------------------------
  // Hybrid search (Phase 14) — combines FTS5 + vector similarity
  // -----------------------------------------------------------------------

  /**
   * Hybrid search that merges FTS5 keyword results with vector similarity.
   * The hybrid score = alpha * normalizedFtsRank + (1-alpha) * vectorScore.
   */
  async hybridSearch(
    keywordQuery: string,
    queryVector: number[] | null,
    options: { limit?: number; alpha?: number; minScore?: number } = {},
  ): Promise<HybridSearchResult[]> {
    const limit = options.limit ?? 10;
    const alpha = options.alpha ?? 0.5;
    const minScore = options.minScore ?? 0.1;

    // FTS5 results
    const ftsResults = await this.searchFTS5(keywordQuery, limit * 3);
    const ftsMax = ftsResults.length;
    const ftsMap = new Map<string, { entry: ChatLogEntry; rankScore: number }>();
    ftsResults.forEach((entry, i) => {
      ftsMap.set(entry.id, { entry, rankScore: 1 - i / Math.max(ftsMax, 1) });
    });

    // Vector results
    const vectorResults = queryVector
      ? this.searchByVector(queryVector, { limit: limit * 3, minScore: 0 })
      : [];
    const vectorMap = new Map<string, { entry: VectorEntry; score: number }>();
    for (const vr of vectorResults) {
      vectorMap.set(vr.entry.id, { entry: vr.entry, score: vr.score });
    }

    // Merge
    const allIds = new Set([...ftsMap.keys(), ...vectorMap.keys()]);
    const merged: HybridSearchResult[] = [];

    for (const id of allIds) {
      const fts = ftsMap.get(id);
      const vec = vectorMap.get(id);

      const ftsScore = fts?.rankScore ?? 0;
      const vectorScore = vec?.score ?? 0;
      const hybridScore = alpha * ftsScore + (1 - alpha) * vectorScore;

      if (hybridScore < minScore) continue;

      const content = fts?.entry.content ?? vec?.entry.content ?? '';
      const sessionId = fts?.entry.session_id ?? vec?.entry.sessionId ?? '';
      const timestamp = fts?.entry.timestamp ?? vec?.entry.timestamp ?? 0;

      merged.push({ id, content, sessionId, ftsScore, vectorScore, hybridScore, timestamp });
    }

    return merged.sort((a, b) => b.hybridScore - a.hybridScore).slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Cosine similarity (Rust or JS fallback)
  // -----------------------------------------------------------------------

  /** Compute cosine similarity between two vectors */
  cosineSimilarity(a: number[], b: number[]): number {
    if (this.rustBindings?.cosineSimilarity) {
      try {
        return this.rustBindings.cosineSimilarity(a, b);
      } catch {
        // fallback
      }
    }
    return cosineSimilarityJS(a, b);
  }

  // -----------------------------------------------------------------------
  // RAM cache
  // -----------------------------------------------------------------------

  cacheEmbedding(key: string, vector: number[]): void {
    const sizeBytes = key.length * 2 + vector.length * 8 + 64;

    const existing = this.ramCache.get(key);
    if (existing) this.ramCacheSizeBytes -= existing.sizeBytes;

    this.ramCache.set(key, { key, vector, lruIndex: this.lruCounter++, sizeBytes });
    this.ramCacheSizeBytes += sizeBytes;

    const limit =
      (this as unknown as { MAX_CACHE_SIZE_BYTES?: number }).MAX_CACHE_SIZE_BYTES ??
      this.config.maxCacheSizeBytes;
    if (this.ramCacheSizeBytes > limit) {
      this.evictLeastRecentlyUsed(limit);
    }
  }

  getEmbeddingFromCache(key: string): number[] | undefined {
    const entry = this.ramCache.get(key);
    if (!entry) {
      this.stats.cacheMisses++;
      return undefined;
    }
    entry.lruIndex = this.lruCounter++;
    this.stats.cacheHits++;
    return entry.vector;
  }

  private evictLeastRecentlyUsed(limit?: number): void {
    const maxLimit = limit ?? this.config.maxCacheSizeBytes;
    const entries = Array.from(this.ramCache.values());
    entries.sort((a, b) => a.lruIndex - b.lruIndex);
    for (const entry of entries) {
      if (this.ramCacheSizeBytes <= maxLimit) break;
      this.ramCache.delete(entry.key);
      this.ramCacheSizeBytes -= entry.sizeBytes;
    }
  }

  getCacheSize(): number {
    return this.ramCache.size;
  }
  getCacheSizeBytes(): number {
    return this.ramCacheSizeBytes;
  }
  clearCache(): void {
    this.ramCache.clear();
    this.ramCacheSizeBytes = 0;
  }

  // -----------------------------------------------------------------------
  // Maintenance
  // -----------------------------------------------------------------------

  async autoVacuum(): Promise<void> {
    if (!this.isFallbackDb && this.db) {
      try {
        this.db.exec('VACUUM');
      } catch {
        /* ignore */
      }
    }
    this.stats.totalVacuums++;
  }

  async purgeOldLogs(days?: number): Promise<number> {
    const retentionDays = days ?? this.config.retentionDays;
    const cutoff = Date.now() - retentionDays * 86_400_000;

    this.stats.totalPurges++;

    if (!this.isFallbackDb && this.db) {
      const s1 = this.db.prepare('DELETE FROM old_chats WHERE timestamp < ?');
      const info = s1.run(cutoff);
      if (this.config.enableFts5) {
        const s2 = this.db.prepare('DELETE FROM old_chats_fts WHERE timestamp < ?');
        s2.run(cutoff);
      }
      await this.autoVacuum();
      return info.changes ?? 0;
    }

    const prev = this.mockDbLogs.length;
    this.mockDbLogs = this.mockDbLogs.filter((l) => l.timestamp >= cutoff);
    return prev - this.mockDbLogs.length;
  }

  /** Purge old vector embeddings by age */
  purgeOldEmbeddings(days?: number): number {
    const retentionDays = days ?? this.config.retentionDays;
    const cutoff = Date.now() - retentionDays * 86_400_000;
    let purged = 0;

    for (const [id, entry] of this.vectorIndex) {
      if (entry.timestamp < cutoff) {
        this.vectorIndex.delete(id);
        this.hnswIndex?.remove(id);
        purged++;
      }
    }

    this.stats.vectorEntries = this.vectorIndex.size;
    return purged;
  }

  async clearDatabase(): Promise<void> {
    if (!this.isFallbackDb && this.db) {
      this.db.exec('DELETE FROM old_chats');
      if (this.config.enableFts5) this.db.exec('DELETE FROM old_chats_fts');
      await this.autoVacuum();
    } else {
      this.mockDbLogs = [];
    }
    this.vectorIndex.clear();
    this.hnswIndex?.clear();
    this.stats.vectorEntries = 0;
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
  }

  // -----------------------------------------------------------------------
  // Statistics
  // -----------------------------------------------------------------------

  getStats(): AddonStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats.totalIndexed = 0;
    this.stats.totalSearches = 0;
    this.stats.totalVacuums = 0;
    this.stats.totalPurges = 0;
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
  }

  /** Whether Rust N-API bindings are loaded */
  hasRustBindings(): boolean {
    return this.rustBindings !== null;
  }

  /** Whether FTS5 is enabled */
  isFts5Enabled(): boolean {
    return this.config.enableFts5;
  }

  /** Get count of indexed chat messages */
  getIndexedCount(): number {
    return this.stats.totalIndexed;
  }

  /** Get count of stored vector embeddings */
  getVectorCount(): number {
    return this.vectorIndex.size;
  }

  /** Get count of HNSW-indexed vectors (0 if Rust bindings unavailable) */
  getHnswSize(): number {
    return this.hnswIndex?.size() ?? 0;
  }

  /** Whether the HNSW index is active */
  hasHnswIndex(): boolean {
    return this.hnswIndex !== null;
  }

  /** Access the raw Rust bindings (for freshness.ts / search.ts delegation) */
  getRustBindings(): RustBindingsLike | null {
    return this.rustBindings;
  }
}
