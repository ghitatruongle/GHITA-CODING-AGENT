// Reciprocal Rank Fusion (RRF) with k=60 combining BM25, vector similarity,
// and graph entity streams. Includes session diversification (max N per session)
// to prevent single-session dominance in results.
//
// Pattern: agentmemory RRF fusion k=60, session diversify max 3/session.

export interface RankedResult {
  id: string;
  content: string;
  score: number;
  source: 'bm25' | 'vector' | 'graph';
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface RRFFusionOptions {
  /** RRF constant k (default: 60). Higher k = less aggressive rank discounting. */
  k?: number;
  /** Maximum results per session for diversification (default: 3). */
  maxPerSession?: number;
  /** Maximum total results to return (default: 10). */
  limit?: number;
  /** Minimum fused score threshold (default: 0). */
  minScore?: number;
}

export const DEFAULT_RRF_OPTIONS: Required<RRFFusionOptions> = {
  k: 60,
  maxPerSession: 3,
  limit: 10,
  minScore: 0,
};

/**
 * Fuse multiple ranked lists using Reciprocal Rank Fusion.
 * RRF score = sum(1 / (k + rank_i)) across all input lists where item appears.
 */
export function rrfFuse(
  lists: Array<{ results: RankedResult[]; weight?: number }>,
  options: RRFFusionOptions = {},
): RankedResult[] {
  const opts = { ...DEFAULT_RRF_OPTIONS, ...options };
  const k = opts.k;

  // Accumulate RRF scores per document ID
  const scores = new Map<string, { score: number; result: RankedResult }>();

  for (const list of lists) {
    const weight = list.weight ?? 1;
    for (let rank = 0; rank < list.results.length; rank++) {
      const result = list.results[rank];
      if (!result) continue;
      const rrfScore = weight / (k + rank + 1);
      const existing = scores.get(result.id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(result.id, { score: rrfScore, result });
      }
    }
  }

  // Sort by fused score descending
  const fused = [...scores.values()]
    .filter((s) => s.score >= opts.minScore)
    .sort((a, b) => b.score - a.score);

  // Apply session diversification
  if (opts.maxPerSession > 0) {
    const sessionCounts = new Map<string, number>();
    const diversified: typeof fused = [];

    for (const item of fused) {
      const sid = item.result.sessionId ?? '__no_session__';
      const count = sessionCounts.get(sid) ?? 0;
      if (count < opts.maxPerSession) {
        diversified.push(item);
        sessionCounts.set(sid, count + 1);
      }
      if (diversified.length >= opts.limit) break;
    }

    return diversified.map((d) => ({ ...d.result, score: d.score }));
  }

  return fused.slice(0, opts.limit).map((d) => ({ ...d.result, score: d.score }));
}

/**
 * Convenience: fuse BM25 + vector + graph results with default weights.
 */
export function fuseRetrievalStreams(
  bm25Results: RankedResult[],
  vectorResults: RankedResult[],
  graphResults: RankedResult[] = [],
  options?: RRFFusionOptions,
): RankedResult[] {
  return rrfFuse(
    [
      { results: bm25Results, weight: 1.0 },
      { results: vectorResults, weight: 1.0 },
      { results: graphResults, weight: 0.8 },
    ],
    options,
  );
}
