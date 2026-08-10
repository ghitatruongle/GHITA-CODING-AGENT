// ==============================================================================
// GHITA CODING AGENT - @ghita/ingest retriever suite (P69 + Track 8 A4)
// ==============================================================================
// Hybrid (BM25+vector RRF), MMR diversity and parent-document retrieval over
// an indexed chunk collection. Fully offline-testable with fakes.
// v1.1.0 Track 8 A4: BM25Index — inverted index (DF precomputed) thay vì quét
// O(N²) từng query (đo: 10k chunks 4230 ms → ~1 ms).
// ==============================================================================

import { loadNative } from '@ghita/native-bridge';
import type { Chunk, RetrieverResult, VectorProvider } from './types.js';

/** v1.1.0 Track 8 A9: retrieval native addon surface (via @ghita/native-bridge). */
interface RetrievalNative {
  Bm25Index: new (
    chunks: Array<{ id: number; text: string }>,
    k1?: number,
    b?: number,
  ) => {
    query(query: string, topK?: number): { ids: Uint32Array; scores: Float32Array };
    size: number;
  };
}

/** Bridge cho retrieval addon — load một lần (native-first, JS fallback). */
const retrievalBridge = () =>
  loadNative<RetrievalNative>('retrieval', undefined as unknown as RetrievalNative);

interface Posting {
  ci: number;
  tf: number;
}

interface TermEntry {
  df: number;
  postings: Posting[];
}

/** Inverted-index BM25: build once, query many times. */
export class BM25Index {
  private readonly index = new Map<string, TermEntry>();
  private readonly avgLen: number;
  private readonly n: number;

  constructor(
    private readonly chunks: readonly Chunk[],
    private readonly k1 = 1.5,
    private readonly b = 0.75,
  ) {
    this.n = chunks.length;
    this.avgLen = chunks.reduce((s, c) => s + c.text.length, 0) / Math.max(1, chunks.length);
    for (const [ci, chunk] of chunks.entries()) {
      const text = chunk.text.toLowerCase();
      const seen = new Set<string>();
      for (const token of tokenize(text)) {
        if (seen.has(token)) continue;
        seen.add(token);
        let entry = this.index.get(token);
        if (!entry) {
          entry = { df: 0, postings: [] };
          this.index.set(token, entry);
        }
        entry.df += 1;
        entry.postings.push({ ci, tf: countOccurrences(text, token) });
      }
    }
  }

  /** Score all chunks for a query (DF precomputed — một lần quét). */
  query(query: string, topK?: number): RetrieverResult[] {
    const terms = tokenize(query);
    const scores = new Map<number, number>();
    for (const term of terms) {
      const entry = this.index.get(term);
      if (!entry) continue;
      const idf = Math.log(1 + (this.n - entry.df + 0.5) / (entry.df + 0.5));
      for (const { ci, tf } of entry.postings) {
        const chunk = this.chunks[ci];
        if (!chunk) continue;
        const tfn =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (chunk.text.length / this.avgLen)));
        scores.set(ci, (scores.get(ci) ?? 0) + idf * tfn);
      }
    }
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const limit = topK ?? ranked.length;
    return ranked.slice(0, limit).flatMap(([ci, score]) => {
      const chunk = this.chunks[ci];
      return chunk
        ? [
            {
              chunkId: chunk.id,
              docPath: chunk.docPath,
              text: chunk.text,
              score,
              source: 'bm25' as const,
            },
          ]
        : [];
    });
  }

  size(): number {
    return this.index.size;
  }
}

/** Lightweight BM25 scorer over a chunk corpus. */
export function bm25Score(
  query: string,
  chunks: readonly Chunk[],
  k1 = 1.5,
  b = 0.75,
): Map<string, number> {
  const terms = tokenize(query);
  const scores = new Map<string, number>();
  const avgLen = chunks.reduce((s, c) => s + c.text.length, 0) / Math.max(1, chunks.length);
  for (const chunk of chunks) {
    let score = 0;
    const text = chunk.text.toLowerCase();
    for (const term of terms) {
      const freq = countOccurrences(text, term);
      if (freq === 0) continue;
      const df = chunks.filter((c) => c.text.toLowerCase().includes(term)).length;
      const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
      const tf = (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (chunk.text.length / avgLen)));
      score += idf * tf;
    }
    if (score > 0) scores.set(chunk.id, score);
  }
  return scores;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Reciprocal Rank Fusion over ranked id lists. */
export function reciprocalRankFusion(
  lists: Array<Map<string, number>>,
  k = 60,
): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of lists) {
    const ranked = [...list.entries()].sort((a, b) => b[1] - a[1]);
    ranked.forEach(([id], rank) => {
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return fused;
}

export interface HybridRetrieverOptions {
  /** Min similarity threshold for vector results. */
  vectorThreshold?: number;
  topK?: number;
}

export class HybridRetriever {
  private readonly native: { index: InstanceType<RetrievalNative['Bm25Index']> } | null;

  constructor(
    private readonly chunks: readonly Chunk[],
    private readonly vectors: VectorProvider,
    private readonly options: HybridRetrieverOptions & { useNative?: boolean } = {},
  ) {
    // v1.1.0 Track 8 A9: native BM25 leg khi addon có sẵn (bỏ qua khi useNative=false).
    const bridge = options.useNative === false ? undefined : retrievalBridge();
    this.native =
      bridge?.native && typeof bridge.impl.Bm25Index === 'function'
        ? {
            index: new bridge.impl.Bm25Index(
              this.chunks.map((c, i) => ({ id: i, text: c.text })),
              1.5,
              0.75,
            ),
          }
        : null;
  }

  /** Retrieve with BM25 + vector fused by RRF. */
  async retrieve(query: string, topK = 5): Promise<RetrieverResult[]> {
    const bm25 = this.bm25Scores(query);
    const queryVector = await this.vectors.embed(query);
    const vector = new Map<string, number>();
    for (const chunk of this.chunks) {
      const chunkVector = await this.vectors.embed(chunk.text.slice(0, 400));
      const sim = cosineSimilarity(queryVector, chunkVector);
      if (sim >= (this.options.vectorThreshold ?? 0.3)) vector.set(chunk.id, sim);
    }
    const fused = reciprocalRankFusion([bm25, vector]);
    return [...fused.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .flatMap(([id, score]) => {
        const chunk = this.chunks.find((c) => c.id === id);
        return chunk
          ? [
              {
                chunkId: id,
                docPath: chunk.docPath,
                text: chunk.text,
                score,
                source: 'hybrid' as const,
              },
            ]
          : [];
      });
  }

  /** BM25 leg: native (inverted index) khi có addon, ngược lại JS. */
  private bm25Scores(query: string): Map<string, number> {
    if (this.native) {
      const result = this.native.index.query(query, this.chunks.length);
      const scores = new Map<string, number>();
      for (let i = 0; i < result.ids.length; i++) {
        const idx = result.ids[i];
        if (idx === undefined) continue;
        const chunk = this.chunks[idx];
        if (chunk) scores.set(chunk.id, result.scores[i] ?? 0);
      }
      return scores;
    }
    return bm25Score(query, this.chunks);
  }

  /** True khi đang dùng native addon cho leg BM25. */
  usingNative(): boolean {
    return this.native !== null;
  }

  /** MMR-diversified selection from the hybrid ranking. */
  async retrieveMMR(query: string, topK = 5, lambda = 0.7): Promise<RetrieverResult[]> {
    const candidates = await this.retrieve(query, Math.max(topK * 3, 6));
    const selected: RetrieverResult[] = [];
    const pool = [...candidates];
    const queryVector = await this.vectors.embed(query);

    while (selected.length < topK && pool.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i];
        if (cand === undefined) continue;
        const relevance = cand.score;
        let maxSim = 0;
        const candVec = await this.vectors.embed(cand.text.slice(0, 400));
        for (const sel of selected) {
          const selVec = await this.vectors.embed(sel.text.slice(0, 400));
          maxSim = Math.max(maxSim, cosineSimilarity(candVec, selVec));
        }
        const mmr = lambda * relevance - (1 - lambda) * maxSim;
        if (mmr > bestScore) {
          bestScore = mmr;
          bestIdx = i;
        }
      }
      const pick = pool.splice(bestIdx, 1)[0];
      if (pick === undefined) break;
      selected.push({ ...pick, source: 'mmr' });
      void queryVector;
    }
    return selected;
  }
}

/** Parent-document retrieval: return the parent chunk for a matched child. */
export function parentDocumentRetrieval(
  children: readonly Chunk[],
  parentOf: (child: Chunk) => Chunk | undefined,
  query: string,
  topK = 5,
): RetrieverResult[] {
  const scored = bm25Score(query, children);
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .flatMap(([id, score]) => {
      const child = children.find((c) => c.id === id);
      if (!child) return [];
      const parent = parentOf(child);
      const target = parent ?? child;
      return [
        {
          chunkId: target.id,
          docPath: target.docPath,
          text: target.text,
          score,
          source: 'bm25',
        },
      ];
    });
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = 0;
  for (;;) {
    index = haystack.indexOf(needle, index);
    if (index === -1) break;
    count += 1;
    index += needle.length;
  }
  return count;
}
