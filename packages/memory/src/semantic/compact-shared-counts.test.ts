// v1.2.0-demo1 Track 3: direct JS↔Rust parity for shared_counts_native
// (the scoreAll core ported to crates/retrieval). Skips when the addon is
// not built on this machine (CI Linux test job) — the golden test still
// covers whichever path is active.

import { describe, it, expect } from 'vitest';
import { loadNative } from '@ghita/native-bridge';

interface SharedCountsNative {
  sharedCountsNative(tokens: number[][], group: number[]): number[];
}

const bridge = loadNative<SharedCountsNative>(
  'retrieval',
  undefined as unknown as SharedCountsNative,
);

/** JS oracle: pairwise float comparison, same semantics as compact.ts. */
function jsSharedCounts(tokens: number[][], group: number[]): number[] {
  const n = tokens.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const size = tokens[i]!.length;
    if (size === 0) {
      out.push(0);
      continue;
    }
    const set = new Set(tokens[i]);
    let count = 0;
    for (let j = 0; j < n; j++) {
      if (group[j] === group[i]) continue;
      let shared = 0;
      for (const t of set) if (tokens[j]!.includes(t)) shared++;
      if (shared / size > 0.3) count++;
    }
    out.push(count);
  }
  return out;
}

const FIXTURES: Array<{ name: string; tokens: number[][]; group: number[] }> = [
  {
    name: 'dense small vocab',
    tokens: [[0, 1, 2, 3], [0, 1, 9, 8], [2, 3, 4, 5], [], [7, 8, 9, 10, 11]],
    group: [0, 1, 2, 3, 4],
  },
  {
    name: 'duplicate id groups',
    tokens: [[0, 1], [0, 1], [0, 1]],
    group: [0, 0, 2],
  },
  {
    name: 'threshold boundary (exactly 0.3)',
    tokens: [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [0, 1, 2, 100, 101, 102, 103, 104, 105, 106, 107, 108],
    ],
    group: [0, 1],
  },
  {
    name: 'sparse large vocab',
    tokens: Array.from({ length: 80 }, (_, i) =>
      Array.from({ length: 25 }, (_, k) => (i * 7 + k * 131) % 9973).sort((a, b) => a - b),
    ),
    group: Array.from({ length: 80 }, (_, i) => i),
  },
];

describe.skipIf(!bridge.native)('shared_counts JS↔Rust parity (native addon present)', () => {
  for (const fx of FIXTURES) {
    it(fx.name, () => {
      expect(bridge.impl.sharedCountsNative(fx.tokens, fx.group)).toEqual(
        jsSharedCounts(fx.tokens, fx.group),
      );
    });
  }

  it('50-round randomized fuzz (dense↔sparse vocab, dup groups, empties)', () => {
    let s = 987654321 >>> 0;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    for (let f = 0; f < 50; f++) {
      const n = 1 + Math.floor(rnd() * 40);
      const vocabSize = [5, 30, 500, 5000][Math.floor(rnd() * 4)]!;
      const tokens: number[][] = [];
      for (let i = 0; i < n; i++) {
        const size = Math.floor(rnd() * 25); // includes 0 (empty set)
        const set = new Set<number>();
        for (let k = 0; k < size; k++) set.add(Math.floor(rnd() * vocabSize));
        tokens.push([...set].sort((a, b) => a - b));
      }
      // ~20% of entries share a group with a previous entry (duplicate ids).
      const group: number[] = [];
      for (let i = 0; i < n; i++) {
        group.push(rnd() < 0.2 && i > 0 ? Math.floor(rnd() * i) : i);
      }
      expect(bridge.impl.sharedCountsNative(tokens, group), `round ${f}`).toEqual(
        jsSharedCounts(tokens, group),
      );
    }
  });
});
