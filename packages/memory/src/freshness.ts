// ==============================================================================
// GHITA CODING AGENT - Phase 22: memoryFreshness (decay)
// ==============================================================================
// Provides temporal memory decay tracking, timeline queries, namespace health,
// and multi-signal weighted retrieval logic.
// ==============================================================================

import type { MemoryEntry, MemorySearchResult } from '@ghita/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 1. Decay scoring (exponential)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 2. Namespace overview + freshness
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 3. Timeline: time-ordered retrieval
// ---------------------------------------------------------------------------
/**
 * Returns filtered and chronologically ordered memory entries.
 */
export function getTimeline(
  entries: MemoryEntry[],
  options?: TimelineOptions,
): MemoryEntry[] {
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

// ---------------------------------------------------------------------------
// 4. Multi-signal retrieval
// ---------------------------------------------------------------------------
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

  const cosineSimilarity = (a: number[], b: number[]): number => {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < len; i++) {
      const va = a[i] ?? 0;
      const vb = b[i] ?? 0;
      dot += va * vb;
      nA += va * va;
      nB += vb * vb;
    }
    if (nA === 0 || nB === 0) return 0;
    return dot / (Math.sqrt(nA) * Math.sqrt(nB));
  };

  const results: MemorySearchResult[] = [];

  for (const entry of entries) {
    // A. Recency/Freshness Signal
    const ns = (entry.metadata?.namespace as string) || entry.type || 'default';
    const halfLife = namespaceHalfLifes[ns] ?? defaultHalfLife;
    const recencyScore = calculateDecayScore(entry.timestamp, halfLife, now);

    // B. Semantic Signal
    let semanticScore = 0.0;
    if (queryVector) {
      const vector = (entry as unknown as { vector?: number[] }).vector || entry.metadata?.vector;
      if (Array.isArray(vector)) {
        semanticScore = cosineSimilarity(queryVector, vector);
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

// ---------------------------------------------------------------------------
// 5. MemoryFreshnessTracker Class
// ---------------------------------------------------------------------------
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

  getTimeline(entries: MemoryEntry[], options?: Omit<TimelineOptions, 'halfLifeMs' | 'namespaceHalfLifes'>): MemoryEntry[] {
    return getTimeline(entries, {
      ...options,
      halfLifeMs: this.config?.halfLifeMs,
      namespaceHalfLifes: this.config?.namespaceHalfLifes,
    });
  }

  retrieveEnhanced(entries: MemoryEntry[], options: Omit<MultiSignalRetrievalOptions, 'halfLifeMs' | 'namespaceHalfLifes'>): MemorySearchResult[] {
    return retrieveEnhanced(entries, {
      ...options,
      halfLifeMs: this.config?.halfLifeMs,
      namespaceHalfLifes: this.config?.namespaceHalfLifes,
    });
  }
}
