// Provides temporal memory decay tracking, timeline queries, namespace health,
// and multi-signal weighted retrieval logic.

import type { MemoryEntry, MemorySearchResult } from '@ghita/shared';
import { cosineSimilarityJS } from './semantic/rustAddon.js';

// Optional Rust NAPI bindings (lazy-loaded once)

type RustBatchDecay = (timestamps: number[], halfLifeMs: number, now: number) => number[];
type RustBatchCosine = (query: number[], candidates: number[][]) => number[];

interface FreshnessRustBindings {
  batchDecayScore?: RustBatchDecay;
  batchCosineSimilarity?: RustBatchCosine;
}

let _cachedRustBindings: FreshnessRustBindings | null | undefined;

declare const require: ((id: string) => unknown) | undefined;

function getRustBindings(): FreshnessRustBindings | null {
  if (_cachedRustBindings !== undefined) return _cachedRustBindings;
  try {
    const r = typeof require !== 'undefined' ? require : null;
    if (!r) throw new Error('require unavailable');
    _cachedRustBindings = r('./rust/index.node') as FreshnessRustBindings;
  } catch {
    _cachedRustBindings = null;
  }
  return _cachedRustBindings;
}

// Types

export interface NamespaceFreshness {
  namespace: string;
  count: number;
  averageFreshness: number;
  newestTimestamp: number;
  oldestTimestamp: number;
}

export interface FreshnessTrackerOptions {
  /** Default half-life in milliseconds (default: 30 days) */
  halfLifeMs?: number;
  /** Namespace-specific half-life overrides */
  namespaceHalfLifes?: Record<string, number>;
  /** Reference point for current time (default: Date.now()) */
  now?: number;
}

export interface TimelineOptions {
  /** Filter entries with freshness >= minFreshness */
  minFreshness?: number;
  /** Default half-life in milliseconds (default: 30 days) */
  halfLifeMs?: number;
  /** Namespace-specific half-life overrides */
  namespaceHalfLifes?: Record<string, number>;
  /** Date range bounds (min timestamp) */
  afterDate?: number;
  /** Date range bounds (max timestamp) */
  beforeDate?: number;
  /** Maximum number of elements to return */
  limit?: number;
  /** Sort order for timeline output (default: 'desc') */
  order?: 'asc' | 'desc';
  /** Reference point for current time (default: Date.now()) */
  now?: number;
}

export interface MultiSignalRetrievalOptions {
  /** Query string for text token overlapping */
  query?: string;
  /** Dense vector embedding representing the query */
  queryVector?: number[];
  /** Weight allocated to the recency (decay) score (default: 0.4) */
  recencyWeight?: number;
  /** Weight allocated to the semantic similarity score (default: 0.3) */
  semanticWeight?: number;
  /** Weight allocated to the importance score (default: 0.2) */
  importanceWeight?: number;
  /** Weight allocated to the access frequency score (default: 0.1) */
  frequencyWeight?: number;
  /** Default half-life in milliseconds for decay */
  halfLifeMs?: number;
  /** Namespace-specific half-life overrides for decay */
  namespaceHalfLifes?: Record<string, number>;
  /** Minimum aggregated score boundary (default: 0.05) */
  minScore?: number;
  /** Maximum number of search results to return */
  limit?: number;
  /** Reference point for current time (default: Date.now()) */
  now?: number;
}

// 1. Decay scoring (exponential)

/**
 * Calculates exponential decay score: Score = 2 ^ (-age / halfLife)
 * Clamps result between 0.0 and 1.0.
 */
export function calculateDecayScore(
  timestamp: number,
  halfLifeMs: number,
  now = Date.now(),
): number {
  if (halfLifeMs <= 0) {
    return 1.0;
  }
  const ageMs = Math.max(0, now - timestamp);
  const score = Math.pow(0.5, ageMs / halfLifeMs);
  return Math.min(1.0, Math.max(0.0, score));
}

// 2. Namespace overview + freshness

/**
 * Summarizes memory entries grouped by their namespace.
 * Namespace is extracted from metadata ('namespace') or type, falling back to 'default'.
 */
export function getNamespaceOverview(
  entries: MemoryEntry[],
  options?: FreshnessTrackerOptions,
): Record<string, NamespaceFreshness> {
  const now = options?.now ?? Date.now();
  const defaultHalfLife = options?.halfLifeMs ?? 30 * 24 * 60 * 60 * 1000; // 30 days
  const namespaceHalfLifes = options?.namespaceHalfLifes ?? {};

  const groups: Record<string, MemoryEntry[]> = {};
  for (const entry of entries) {
    const ns = (entry.metadata?.namespace as string) || entry.type || 'default';
    if (!groups[ns]) {
      groups[ns] = [];
    }
    groups[ns].push(entry);
  }

  const overview: Record<string, NamespaceFreshness> = {};
  for (const [ns, nsEntries] of Object.entries(groups)) {
    const halfLife = namespaceHalfLifes[ns] ?? defaultHalfLife;
    let totalFreshness = 0;
    let newestTimestamp = -Infinity;
    let oldestTimestamp = Infinity;

    for (const entry of nsEntries) {
      const freshness = calculateDecayScore(entry.timestamp, halfLife, now);
      totalFreshness += freshness;
      if (entry.timestamp > newestTimestamp) newestTimestamp = entry.timestamp;
      if (entry.timestamp < oldestTimestamp) oldestTimestamp = entry.timestamp;
    }

    overview[ns] = {
      namespace: ns,
      count: nsEntries.length,
      averageFreshness: nsEntries.length > 0 ? totalFreshness / nsEntries.length : 0.0,
      newestTimestamp: newestTimestamp === -Infinity ? 0 : newestTimestamp,
      oldestTimestamp: oldestTimestamp === Infinity ? 0 : oldestTimestamp,
    };
  }

  return overview;
}

// 3. Timeline: time-ordered retrieval

/**
 * Returns filtered and chronologically ordered memory entries.
 */
export function getTimeline(entries: MemoryEntry[], options?: TimelineOptions): MemoryEntry[] {
  const now = options?.now ?? Date.now();
  const defaultHalfLife = options?.halfLifeMs ?? 30 * 24 * 60 * 60 * 1000;
  const namespaceHalfLifes = options?.namespaceHalfLifes ?? {};
  const order = options?.order ?? 'desc';

  let filtered = entries.filter((entry) => {
    if (options?.afterDate !== undefined && entry.timestamp < options.afterDate) {
      return false;
    }
    if (options?.beforeDate !== undefined && entry.timestamp > options.beforeDate) {
      return false;
    }

    if (options?.minFreshness !== undefined) {
      const ns = (entry.metadata?.namespace as string) || entry.type || 'default';
      const halfLife = namespaceHalfLifes[ns] ?? defaultHalfLife;
      const freshness = calculateDecayScore(entry.timestamp, halfLife, now);
      if (freshness < options.minFreshness) {
        return false;
      }
    }

    return true;
  });

  filtered.sort((a, b) => {
    return order === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
  });

  if (options?.limit !== undefined) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

// 4. Multi-signal retrieval

/**
 * Scores and retrieves memory entries combining recency (decay), semantic similarity,
 * importance/relevance, and access frequency signals.
 */
export function retrieveEnhanced(
  entries: MemoryEntry[],
  options: MultiSignalRetrievalOptions,
): MemorySearchResult[] {
  const now = options.now ?? Date.now();
  const query = options.query ?? '';
  const queryVector = options.queryVector;

  const recencyWeight = options.recencyWeight ?? 0.4;
  const semanticWeight = options.semanticWeight ?? 0.3;
  const importanceWeight = options.importanceWeight ?? 0.2;
  const frequencyWeight = options.frequencyWeight ?? 0.1;
  const minScore = options.minScore ?? 0.05;
  const limit = options.limit ?? 5;
  const defaultHalfLife = options.halfLifeMs ?? 30 * 24 * 60 * 60 * 1000;
  const namespaceHalfLifes = options.namespaceHalfLifes ?? {};

  const TOKEN_PATTERN = /[\p{L}\p{N}_-]+/gu;
  const tokenize = (val: string): Set<string> => {
    const matches = val.toLowerCase().match(TOKEN_PATTERN) ?? [];
    return new Set(matches.filter((t) => t.length > 1));
  };
  const queryTokens = tokenize(query);

  // --- Rust fast-path: batch decay + batch cosine in one pass ---
  const rust = getRustBindings();

  // Precompute all decay scores in batch via Rust (or JS fallback)
  let decayScores: number[] | null = null;
  if (rust?.batchDecayScore && entries.length > 0) {
    // Compute per-entry half-life respecting namespace overrides
    const timestamps: number[] = [];
    const halfLives: number[] = [];
    for (const entry of entries) {
      const ns = (entry.metadata?.namespace as string) || entry.type || 'default';
      timestamps.push(entry.timestamp);
      halfLives.push(namespaceHalfLifes[ns] ?? defaultHalfLife);
    }
    // Rust batch_decay_score uses a single halfLife; we group by unique halfLife
    // For the common case (all same namespace), one call suffices
    const uniqueHalfLives = new Set(halfLives);
    if (uniqueHalfLives.size === 1) {
      decayScores = rust.batchDecayScore(timestamps, halfLives[0] ?? defaultHalfLife, now);
    }
    // If multiple namespaces, fall through to per-entry JS computation
  }

  // Precompute all cosine similarities in batch via Rust
  let cosineScores: number[] | null = null;
  if (rust?.batchCosineSimilarity && queryVector && entries.length > 0) {
    const vectors: number[][] = [];
    let allHaveVectors = true;
    for (const entry of entries) {
      const vec = (entry as unknown as { vector?: number[] }).vector || entry.metadata?.vector;
      if (Array.isArray(vec)) {
        vectors.push(vec as number[]);
      } else {
        allHaveVectors = false;
        vectors.push([]); // placeholder
      }
    }
    if (allHaveVectors && vectors.length > 0) {
      cosineScores = rust.batchCosineSimilarity(queryVector, vectors);
    }
  }

  const results: MemorySearchResult[] = [];

  for (let ei = 0; ei < entries.length; ei++) {
    const entry = entries[ei];
    if (!entry) continue;

    // A. Recency/Freshness Signal
    let recencyScore: number;
    if (decayScores && decayScores[ei] !== undefined) {
      recencyScore = decayScores[ei] as number;
    } else {
      const ns = (entry.metadata?.namespace as string) || entry.type || 'default';
      const halfLife = namespaceHalfLifes[ns] ?? defaultHalfLife;
      recencyScore = calculateDecayScore(entry.timestamp, halfLife, now);
    }

    // B. Semantic Signal
    let semanticScore = 0.0;
    if (queryVector) {
      if (cosineScores && cosineScores[ei] !== undefined) {
        semanticScore = cosineScores[ei] as number;
      } else {
        const vector = (entry as unknown as { vector?: number[] }).vector || entry.metadata?.vector;
        if (Array.isArray(vector)) {
          semanticScore = cosineSimilarityJS(queryVector, vector);
        }
      }
    } else if (query) {
      const entryTokens = tokenize(entry.content);
      if (queryTokens.size > 0 && entryTokens.size > 0) {
        let intersection = 0;
        for (const t of queryTokens) {
          if (entryTokens.has(t)) {
            intersection++;
          }
        }
        semanticScore = intersection / queryTokens.size;
      }
    }

    // C. Importance Signal
    const importanceScore =
      typeof entry.relevance === 'number'
        ? entry.relevance
        : typeof entry.metadata?.importance === 'number'
          ? entry.metadata.importance
          : typeof entry.metadata?._importance === 'number'
            ? entry.metadata._importance
            : 0.5;

    // D. Frequency Signal
    const accessCount =
      typeof entry.metadata?.accessCount === 'number'
        ? entry.metadata.accessCount
        : typeof entry.metadata?._accessCount === 'number'
          ? entry.metadata._accessCount
          : 0;
    const frequencyScore = Math.min(1.0, accessCount / 10);

    // Aggregate score based on weights
    const compositeScore =
      recencyWeight * recencyScore +
      semanticWeight * semanticScore +
      importanceWeight * importanceScore +
      frequencyWeight * frequencyScore;

    if (compositeScore >= minScore) {
      results.push({
        entry: { ...entry },
        score: compositeScore,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// 5. MemoryFreshnessTracker Class

export class MemoryFreshnessTracker {
  constructor(
    private config?: {
      halfLifeMs?: number;
      namespaceHalfLifes?: Record<string, number>;
    },
  ) {}

  calculateDecayScore(timestamp: number, now?: number): number {
    const halfLife = this.config?.halfLifeMs ?? 30 * 24 * 60 * 60 * 1000;
    return calculateDecayScore(timestamp, halfLife, now);
  }

  getNamespaceOverview(entries: MemoryEntry[], now?: number): Record<string, NamespaceFreshness> {
    return getNamespaceOverview(entries, {
      halfLifeMs: this.config?.halfLifeMs,
      namespaceHalfLifes: this.config?.namespaceHalfLifes,
      now,
    });
  }

  getTimeline(
    entries: MemoryEntry[],
    options?: Omit<TimelineOptions, 'halfLifeMs' | 'namespaceHalfLifes'>,
  ): MemoryEntry[] {
    return getTimeline(entries, {
      ...options,
      halfLifeMs: this.config?.halfLifeMs,
      namespaceHalfLifes: this.config?.namespaceHalfLifes,
    });
  }

  retrieveEnhanced(
    entries: MemoryEntry[],
    options: Omit<MultiSignalRetrievalOptions, 'halfLifeMs' | 'namespaceHalfLifes'>,
  ): MemorySearchResult[] {
    return retrieveEnhanced(entries, {
      ...options,
      halfLifeMs: this.config?.halfLifeMs,
      namespaceHalfLifes: this.config?.namespaceHalfLifes,
    });
  }
}
