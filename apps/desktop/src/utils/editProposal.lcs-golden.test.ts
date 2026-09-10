// v1.2.0-demo1 P2.2 golden test: lcsLength optimization (trim + Hunt–Szymanski)
// must produce IDENTICAL added/removed counts to the naive O(n·m) DP on
// randomized fixtures (duplicates, unicode, empty, single-line, disjoint).

import { describe, it, expect } from 'vitest';
import { lineDiffStat } from './editProposal';

/** Reference: the original rolling-DP LCS, kept here as the oracle. */
function naiveLcs(a: string[], b: string[]): number {
  const n = a.length;
  const m = b.length;
  let prev = new Array<number>(m + 1).fill(0);
  let curr = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      curr[j] =
        a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[m] ?? 0;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const ALPHABETS = [
  ['a', 'b', 'c'],
  ['x'],
  ['line %d', 'dup', 'dup', 'tail'],
  ['中文行', 'émoji 🚀', 'ascii', 'émoji 🚀'],
];

describe('lineDiffStat — optimized LCS parity vs naive DP', () => {
  it('edge cases', () => {
    const cases: Array<[string[], string[]]> = [
      [[], []],
      [[], ['a']],
      [['a'], []],
      [['a'], ['a']],
      [['a'], ['b']],
      ['a b c'.split(' '), 'c b a'.split(' ')],
      ['dup dup dup'.split(' '), 'dup dup'.split(' ')],
    ];
    for (const [a, b] of cases) {
      // lineDiffStat splits on '\n' first — '' becomes [''], mirror that.
      const orig = a.join('\n');
      const prop = b.join('\n');
      const la = orig.split('\n');
      const lb = prop.split('\n');
      const lcs = naiveLcs(la, lb);
      expect(lineDiffStat(orig, prop)).toEqual({
        added: lb.length - lcs,
        removed: la.length - lcs,
        unchanged: orig === prop,
      });
    }
  });

  it('200 randomized fixtures match the naive oracle exactly', () => {
    const rnd = seeded(1234567);
    for (let f = 0; f < 200; f++) {
      const alpha = ALPHABETS[Math.floor(rnd() * ALPHABETS.length)]!;
      const n = 1 + Math.floor(rnd() * 60);
      const m = 1 + Math.floor(rnd() * 60);
      const a = Array.from({ length: n }, () =>
        alpha[Math.floor(rnd() * alpha.length)]!.replace('%d', String(Math.floor(rnd() * 5))),
      );
      const b = Array.from({ length: m }, () =>
        alpha[Math.floor(rnd() * alpha.length)]!.replace('%d', String(Math.floor(rnd() * 5))),
      );
      const lcs = naiveLcs(a, b);
      expect(lineDiffStat(a.join('\n'), b.join('\n'))).toEqual({
        added: b.length - lcs,
        removed: a.length - lcs,
        unchanged: false,
      });
    }
  });

  it('realistic edit shape: 2k lines, 2% touched', () => {
    const base = Array.from({ length: 2000 }, (_, i) => `line ${i} body ${i % 991}`);
    const edited = base.map((l, i) => (i % 50 === 25 ? `${l} // t` : l));
    const lcs = naiveLcs(base, edited);
    expect(lineDiffStat(base.join('\n'), edited.join('\n'))).toEqual({
      added: edited.length - lcs,
      removed: base.length - lcs,
      unchanged: false,
    });
  });
});
