// v1.2.0-demo1 P2.2 golden test: scoreAll optimization (adaptive bitset /
// inverted index) must produce IDENTICAL ImportanceScore values to the
// current pairwise implementation on randomized fixtures.

import { describe, it, expect } from 'vitest';
import { MemoryCompactor } from './compact';
import type { CompactableEntry } from './types.js';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Oracle: the current pairwise algorithm, verbatim. */
function oracleScoreAll(entries: CompactableEntry[], now: number): ReturnType<MemoryCompactor['scoreAll']> {
  const tokenize = (text: string): Set<string> =>
    new Set(
      (text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []).filter((t) => t.length > 1),
    );
  // Use the compactor's own tokenize via score() single-entry path is not
  // exposed; replicate TOKEN_PATTERN from compact.ts.
  const tokenSets = new Map<string, Set<string>>();
  for (const e of entries) tokenSets.set(e.id, tokenize(e.content));
  const cfg = {
    recencyWeight: 0.4,
    frequencyWeight: 0.3,
    relevanceWeight: 0.3,
    decayHalfLifeDays: 7,
  };
  return entries.map((entry) => {
    const ageMs = Math.max(0, now - entry.timestamp);
    const recency = Math.pow(0.5, ageMs / 86_400_000 / cfg.decayHalfLifeDays);
    const entryTokens = tokenSets.get(entry.id)!;
    let sharedCount = 0;
    for (const other of entries) {
      if (other.id === entry.id) continue;
      const otherTokens = tokenSets.get(other.id)!;
      let shared = 0;
      for (const t of entryTokens) if (otherTokens.has(t)) shared++;
      if (entryTokens.size > 0 && shared / entryTokens.size > 0.3) sharedCount++;
    }
    const frequency = Math.min(1, sharedCount / Math.max(entries.length * 0.1, 1));
    const relevance = entry.relevance ?? 0;
    const composite =
      cfg.recencyWeight * recency + cfg.frequencyWeight * frequency + cfg.relevanceWeight * relevance;
    return { entryId: entry.id, recency, frequency, relevance, composite };
  });
}

function makeEntries(rnd: () => number, count: number, vocab: number): CompactableEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    content: Array.from(
      { length: 20 + Math.floor(rnd() * 30) },
      () => `w${Math.floor(rnd() * vocab)}`,
    ).join(' '),
    timestamp: Date.now() - Math.floor(rnd() * 86_400_000 * 10),
    relevance: rnd(),
  }));
}

describe('MemoryCompactor.scoreAll — optimized parity vs pairwise oracle', () => {
  const compact = new MemoryCompactor({});
  const NOW = Date.now();

  it('dense small vocab (bitset regime)', () => {
    const rnd = seeded(42);
    const entries = makeEntries(rnd, 300, 40);
    expect(compact.scoreAll(entries, NOW)).toEqual(oracleScoreAll(entries, NOW));
  });

  it('sparse large vocab (inverted-index regime)', () => {
    const rnd = seeded(99);
    const entries = makeEntries(rnd, 300, 5000);
    expect(compact.scoreAll(entries, NOW)).toEqual(oracleScoreAll(entries, NOW));
  });

  it('mixed: duplicates, empty content, single entry', () => {
    const entries: CompactableEntry[] = [
      { id: 'a', content: 'same same same', timestamp: NOW - 1000, relevance: 0.5 },
      { id: 'b', content: 'same same same', timestamp: NOW - 2000, relevance: 0.5 },
      { id: 'c', content: '', timestamp: NOW - 3000, relevance: 0 },
      { id: 'd', content: 'xyzzy plugh', timestamp: NOW - 4000, relevance: undefined },
    ];
    expect(compact.scoreAll(entries, NOW)).toEqual(oracleScoreAll(entries, NOW));
    expect(compact.scoreAll([{ id: 'solo', content: 'one two three', timestamp: NOW }], NOW)).toEqual(
      oracleScoreAll([{ id: 'solo', content: 'one two three', timestamp: NOW }], NOW),
    );
  });

  it('1000-entry fixture parity (bench shape)', () => {
    const rnd = seeded(7);
    const entries = makeEntries(rnd, 1000, 60);
    expect(compact.scoreAll(entries, NOW)).toEqual(oracleScoreAll(entries, NOW));
  });
});
