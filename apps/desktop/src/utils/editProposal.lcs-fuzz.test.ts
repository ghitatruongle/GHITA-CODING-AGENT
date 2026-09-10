// v1.2.0-demo1 review pass: adversarial fuzz for the Hunt–Szymanski lcsLength
// against the naive O(n·m) DP oracle. Shapes chosen to break the common
// assumptions: all-identical lines (max duplicates), 2-symbol alphabet (r≈n·m/4),
// reversed, prefix/suffix relations, unicode, empty lines, single lines.

import { describe, it, expect } from 'vitest';
import { lineDiffStat } from './editProposal';

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

function expectStat(a: string[], b: string[]): void {
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

describe('lcsLength adversarial fuzz vs naive DP', () => {
  it('all-identical lines (maximum duplicate density)', () => {
    expectStat(Array(500).fill('x'), Array(300).fill('x'));
    expectStat(Array(300).fill('x'), Array(500).fill('x'));
    expectStat(Array(400).fill('x'), Array(400).fill('x'));
  });

  it('2-symbol alphabet — r ≈ n·m/4 worst-ish case', () => {
    const rnd = seeded(20260831);
    for (let f = 0; f < 20; f++) {
      const a = Array.from({ length: 250 }, () => (rnd() < 0.5 ? 'p' : 'q'));
      const b = Array.from({ length: 250 }, () => (rnd() < 0.5 ? 'p' : 'q'));
      expectStat(a, b);
    }
  });

  it('reversed / rotated / prefix-relations', () => {
    const base = Array.from({ length: 400 }, (_, i) => `l${i % 97}`);
    expectStat(base, [...base].reverse());
    expectStat(base, [...base.slice(120), ...base.slice(0, 120)]);
    expectStat(base, base.slice(0, 250));
    expectStat(base.slice(0, 250), base);
  });

  it('unicode: Vietnamese diacritics, CJK, emoji lines', () => {
    const vi = 'Xin chào thế giới có dấu'.split(' ');
    const cjk = '中文测试：中文文本'.split('：');
    const emo = ['🚀 launch', '🔥 hot', '💡 idea', '🚀 launch'];
    expectStat([...vi, ...cjk, ...emo], [...emo, ...vi, ...cjk]);
    expectStat(Array(200).fill('中文行🚀'), Array(150).fill('中文行🚀'));
  });

  it('empty lines and single-line shapes', () => {
    expectStat(['', '', 'a', ''], ['', 'a', '', '']);
    expectStat([''], ['']);
    expectStat([''], ['a', 'b']);
    expectStat(['a', 'b'], ['']);
    expectStat(['only'], ['other']);
    expectStat(['only'], ['only']);
  });

  it('long common prefix AND suffix with edited middle (trim path)', () => {
    const head = Array.from({ length: 100 }, (_, i) => `h${i}`);
    const tail = Array.from({ length: 100 }, (_, i) => `t${i}`);
    const midA = Array.from({ length: 50 }, (_, i) => `a${i}`);
    const midB = Array.from({ length: 60 }, (_, i) => `b${i}`);
    expectStat([...head, ...midA, ...tail], [...head, ...midB, ...tail]);
  });

  it('interleaved duplicates (HS descending-position invariant)', () => {
    const rnd = seeded(99);
    for (let f = 0; f < 15; f++) {
      const a = Array.from({ length: 120 }, () => `d${Math.floor(rnd() * 6)}`);
      const b = Array.from({ length: 120 }, () => `d${Math.floor(rnd() * 6)}`);
      expectStat(a, b);
    }
  });
});
