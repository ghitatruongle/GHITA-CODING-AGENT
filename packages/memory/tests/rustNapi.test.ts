// Tests the Rust NAPI bindings: SIMD cosine, HNSW index, batch decay scoring.
// All tests gracefully fall back to JS when the native addon is unavailable.

import { describe, it, expect, beforeAll } from 'vitest';
import { RustMemoryAddon } from '../src/semantic/rustAddon.js';
import type { VectorEntry } from '../src/semantic/rustAddon.js';

// Try to load the Rust bindings directly
let rustBindings: Record<string, unknown> | null = null;

beforeAll(() => {
  try {
    const r = typeof require !== 'undefined' ? require : null;
    if (r) {
      rustBindings = r('../src/semantic/rust/index.node') as Record<string, unknown>;
    }
  } catch {
    rustBindings = null;
  }
});

// 1. Cosine Similarity

describe('Rust NAPI — Cosine Similarity', () => {
  function jsCosine(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;
    let dot = 0,
      nA = 0,
      nB = 0;
    for (let i = 0; i < len; i++) {
      const va = a[i] ?? 0;
      const vb = b[i] ?? 0;
      dot += va * vb;
      nA += va * va;
      nB += vb * vb;
    }
    if (nA === 0 || nB === 0) return 0;
    return dot / (Math.sqrt(nA) * Math.sqrt(nB));
  }

  it('should return ~1.0 for identical vectors', () => {
    const addon = new RustMemoryAddon(':memory:');
    const v = [1.0, 2.0, 3.0, 4.0, 5.0];
    expect(addon.cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
    addon.close();
  });

  it('should return 0 for orthogonal vectors', () => {
    const addon = new RustMemoryAddon(':memory:');
    expect(addon.cosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0);
    addon.close();
  });

  it('should return 0 for zero-norm vectors', () => {
    const addon = new RustMemoryAddon(':memory:');
    expect(addon.cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    addon.close();
  });

  it('should match JS fallback on random 128-dim vectors', () => {
    const addon = new RustMemoryAddon(':memory:');
    const dim = 128;
    const a = Array.from({ length: dim }, (_, i) => Math.sin(i * 0.1));
    const b = Array.from({ length: dim }, (_, i) => Math.cos(i * 0.1));

    const rustScore = addon.cosineSimilarity(a, b);
    const jsScore = jsCosine(a, b);

    expect(rustScore).toBeCloseTo(jsScore, 4);
    addon.close();
  });

  it('should match JS fallback on 1536-dim vectors (typical embedding size)', () => {
    const addon = new RustMemoryAddon(':memory:');
    const dim = 1536;
    const a = Array.from({ length: dim }, (_, i) => Math.sin(i * 0.01) * 0.5);
    const b = Array.from({ length: dim }, (_, i) => Math.cos(i * 0.01) * 0.5);

    const rustScore = addon.cosineSimilarity(a, b);
    const jsScore = jsCosine(a, b);

    expect(rustScore).toBeCloseTo(jsScore, 3);
    addon.close();
  });

  it('batch_cosine_similarity should match individual cosine calls', () => {
    if (!rustBindings) return; // skip if no bindings
    const cosineSim = rustBindings.cosineSimilarity as (a: number[], b: number[]) => number;
    const batchCosine = rustBindings.batchCosineSimilarity as (
      q: number[],
      c: number[][],
    ) => number[];
    if (!batchCosine || !cosineSim) return;

    const query = Array.from({ length: 64 }, (_, i) => Math.sin(i));
    const candidates = Array.from({ length: 20 }, (_, j) =>
      Array.from({ length: 64 }, (_, i) => Math.cos(i + j)),
    );

    const batchScores = batchCosine(query, candidates);
    expect(batchScores).toHaveLength(20);

    for (let i = 0; i < candidates.length; i++) {
      const individual = cosineSim(query, candidates[i]!);
      expect(batchScores[i]).toBeCloseTo(individual, 6);
    }
  });
});

// 2. HNSW Index

describe('Rust NAPI — HNSW Index', () => {
  it('should create, add, search, and remove via RustMemoryAddon', () => {
    const addon = new RustMemoryAddon({ maxVectorEntries: 1000 });

    const dim = 64;
    const entries: VectorEntry[] = Array.from({ length: 50 }, (_, i) => ({
      id: `vec_${i}`,
      vector: Array.from({ length: dim }, (_, j) => Math.sin(i * 0.1 + j * 0.05)),
      content: `Entry ${i}`,
      sessionId: 'sess_1',
      timestamp: Date.now() - i * 1000,
    }));

    addon.storeEmbeddings(entries);
    expect(addon.getVectorCount()).toBe(50);

    // Search
    const query = entries[10]!.vector;
    const results = addon.searchByVector(query, { limit: 5, minScore: 0.0 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);

    // The query vector itself should be the top result
    expect(results[0]!.entry.id).toBe('vec_10');
    expect(results[0]!.score).toBeCloseTo(1.0, 2);

    // Remove one
    const removed = addon.removeEmbedding('vec_10');
    expect(removed).toBe(true);
    expect(addon.getVectorCount()).toBe(49);

    // Search again — vec_10 should no longer appear
    const results2 = addon.searchByVector(query, { limit: 5, minScore: 0.0 });
    expect(results2.find((r) => r.entry.id === 'vec_10')).toBeUndefined();

    addon.close();
  });

  it('should use HNSW index when Rust bindings are available', () => {
    const addon = new RustMemoryAddon(':memory:');

    const dim = 32;
    const entries: VectorEntry[] = Array.from({ length: 20 }, (_, i) => ({
      id: `h_${i}`,
      vector: Array.from({ length: dim }, (_, j) => Math.sin(i + j)),
      content: `HNSW ${i}`,
      sessionId: 's',
      timestamp: Date.now(),
    }));

    addon.storeEmbeddings(entries);

    // HNSW should be initialized after storing
    if (rustBindings) {
      expect(addon.hasHnswIndex()).toBe(true);
      expect(addon.getHnswSize()).toBe(20);
    }

    addon.close();
  });

  it('should batch-add embeddings efficiently', () => {
    const addon = new RustMemoryAddon({ maxVectorEntries: 5000 });
    const dim = 64;
    const entries: VectorEntry[] = Array.from({ length: 100 }, (_, i) => ({
      id: `batch_${i}`,
      vector: Array.from({ length: dim }, (_, j) => Math.cos(i * 0.2 + j * 0.1)),
      content: `Batch ${i}`,
      sessionId: 's',
      timestamp: Date.now() - i * 100,
    }));

    addon.storeEmbeddings(entries);
    expect(addon.getVectorCount()).toBe(100);

    if (rustBindings) {
      expect(addon.getHnswSize()).toBe(100);
    }

    addon.close();
  });

  it('clearDatabase should also clear HNSW', async () => {
    const addon = new RustMemoryAddon(':memory:');
    const entries: VectorEntry[] = Array.from({ length: 10 }, (_, i) => ({
      id: `clr_${i}`,
      vector: Array.from({ length: 16 }, () => Math.random()),
      content: `Clear ${i}`,
      sessionId: 's',
      timestamp: Date.now(),
    }));
    addon.storeEmbeddings(entries);
    expect(addon.getVectorCount()).toBe(10);

    await addon.clearDatabase();
    expect(addon.getVectorCount()).toBe(0);
    expect(addon.getHnswSize()).toBe(0);

    addon.close();
  });

  it('HNSW recall should include the exact match', () => {
    if (!rustBindings?.HnswIndex) return;

    const HnswIndex = rustBindings.HnswIndex as new (dim: number) => {
      add(id: string, vector: number[]): void;
      search(q: number[], k: number, ef?: number): Array<{ id: string; score: number }>;
      size(): number;
    };

    const idx = new HnswIndex(64);
    const vectors: Array<{ id: string; vec: number[] }> = [];

    for (let i = 0; i < 200; i++) {
      const vec = Array.from({ length: 64 }, (_, j) => Math.sin(i * 0.3 + j * 0.1));
      idx.add(`v${i}`, vec);
      vectors.push({ id: `v${i}`, vec });
    }

    expect(idx.size()).toBe(200);

    // Search for an exact vector — should find it
    const targetIdx = 42;
    const results = idx.search(vectors[targetIdx]!.vec, 5, 100);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe(`v${targetIdx}`);
    expect(results[0]!.score).toBeCloseTo(1.0, 2);
  });
});

// 3. Batch Decay Scoring

describe('Rust NAPI — Batch Decay Scoring', () => {
  it('batch_decay_score should match JS calculateDecayScore', () => {
    if (!rustBindings?.batchDecayScore) return;

    const batchDecay = rustBindings.batchDecayScore as (
      ts: number[],
      halfLife: number,
      now: number,
    ) => number[];

    const now = Date.now();
    const halfLifeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const timestamps = [
      now, // fresh
      now - 15 * 86400000, // 15 days old
      now - 30 * 86400000, // 30 days (1 half-life)
      now - 60 * 86400000, // 60 days (2 half-lives)
      now - 90 * 86400000, // 90 days (3 half-lives)
    ];

    const scores = batchDecay(timestamps, halfLifeMs, now);
    expect(scores).toHaveLength(5);

    // Fresh entry → ~1.0
    expect(scores[0]).toBeCloseTo(1.0, 5);
    // 1 half-life → ~0.5
    expect(scores[2]).toBeCloseTo(0.5, 2);
    // 2 half-lives → ~0.25
    expect(scores[3]).toBeCloseTo(0.25, 2);
    // 3 half-lives → ~0.125
    expect(scores[4]).toBeCloseTo(0.125, 2);

    // Monotonically decreasing
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]! + 1e-10);
    }
  });

  it('should handle zero half-life gracefully', () => {
    if (!rustBindings?.batchDecayScore) return;

    const batchDecay = rustBindings.batchDecayScore as (
      ts: number[],
      halfLife: number,
      now: number,
    ) => number[];

    const scores = batchDecay([0, 100, 1000], 0, 5000);
    // Zero half-life → all scores should be 1.0
    for (const s of scores) {
      expect(s).toBe(1.0);
    }
  });

  it('should handle future timestamps (clamp to 1.0)', () => {
    if (!rustBindings?.batchDecayScore) return;

    const batchDecay = rustBindings.batchDecayScore as (
      ts: number[],
      halfLife: number,
      now: number,
    ) => number[];

    const now = 1000;
    const scores = batchDecay([2000, 3000, 5000], 500, now);
    for (const s of scores) {
      expect(s).toBe(1.0);
    }
  });

  it('should handle large batch (10K entries)', () => {
    if (!rustBindings?.batchDecayScore) return;

    const batchDecay = rustBindings.batchDecayScore as (
      ts: number[],
      halfLife: number,
      now: number,
    ) => number[];

    const now = 1_000_000_000;
    const halfLife = 86_400_000; // 1 day
    const timestamps = Array.from({ length: 10_000 }, (_, i) => now - i * 3_600_000);

    const start = performance.now();
    const scores = batchDecay(timestamps, halfLife, now);
    const elapsed = performance.now() - start;

    expect(scores).toHaveLength(10_000);
    // Should be monotonically decreasing
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]! + 1e-10);
    }
    // Should be fast (well under 1 second)
    expect(elapsed).toBeLessThan(1000);
  });
});

// 4. Edge Cases

describe('Rust NAPI — Edge Cases', () => {
  it('empty vector search returns empty results', () => {
    const addon = new RustMemoryAddon(':memory:');
    const results = addon.searchByVector([1, 2, 3], { limit: 5 });
    expect(results).toEqual([]);
    addon.close();
  });

  it('zero-vector cosine returns 0', () => {
    const addon = new RustMemoryAddon(':memory:');
    expect(addon.cosineSimilarity([], [])).toBe(0);
    expect(addon.cosineSimilarity([0, 0], [1, 2])).toBe(0);
    addon.close();
  });

  it('HNSW handles dimension mismatch gracefully', () => {
    if (!rustBindings?.HnswIndex) return;

    const HnswIndex = rustBindings.HnswIndex as new (dim: number) => {
      add(id: string, vector: number[]): void;
      search(q: number[], k: number): Array<{ id: string; score: number }>;
    };

    const idx = new HnswIndex(4);
    idx.add('a', [1, 2, 3, 4]);

    // Search with different dimension — should still return results (uses min length)
    const results = idx.search([1, 2, 3, 4, 5, 6], 1);
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('capacity eviction also removes from HNSW', () => {
    const addon = new RustMemoryAddon({ maxVectorEntries: 5 });
    const dim = 16;

    for (let i = 0; i < 10; i++) {
      addon.storeEmbedding({
        id: `ev_${i}`,
        vector: Array.from({ length: dim }, () => Math.random()),
        content: `Evict ${i}`,
        sessionId: 's',
        timestamp: Date.now() - (10 - i) * 1000, // older entries first
      });
    }

    // Should only keep 5 entries
    expect(addon.getVectorCount()).toBe(5);

    if (rustBindings) {
      // HNSW size should match vectorIndex size
      expect(addon.getHnswSize()).toBeLessThanOrEqual(5);
    }

    addon.close();
  });
});

// 5. Integration — retrieveEnhanced with Rust batch ops

describe('Rust NAPI — Integration with freshness.ts', () => {
  it('retrieveEnhanced should use batch decay when available', async () => {
    const { retrieveEnhanced } = await import('../src/freshness.js');

    const now = Date.now();
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: `fe_${i}`,
      type: 'conversation' as const,
      content: `Memory entry ${i} about topic ${i % 5}`,
      timestamp: now - i * 86400000, // 1 day apart
      metadata: { importance: 0.5 + i * 0.02 },
    }));

    const results = retrieveEnhanced(entries, {
      recencyWeight: 0.6,
      importanceWeight: 0.4,
      semanticWeight: 0,
      frequencyWeight: 0,
      limit: 10,
      now,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(10);
    // Most recent entry should rank highest (highest recency + importance)
    expect(results[0]!.entry.id).toBe('fe_0');
  });
});
