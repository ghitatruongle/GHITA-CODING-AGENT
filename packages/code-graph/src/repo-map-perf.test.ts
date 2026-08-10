import { describe, it, expect } from 'vitest';
import { registerNative, unregisterNative } from '@ghita/native-bridge';
import { computePageRank } from './repo-map.js';
import type { CodeEdge, CodeNode } from './types.js';

function makeGraph(n: number): { nodes: CodeNode[]; edges: CodeEdge[] } {
  const nodes: CodeNode[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push({
      id: `sym-${i}`,
      qualifiedName: `pkg::sym_${i}`,
      name: `sym_${i}`,
      kind: 'function',
      filePath: `src/mod_${i % 5}.ts`,
      startLine: i + 1,
      endLine: i + 1,
      excerpt: `export function sym_${i}() {}`,
      exported: i % 3 === 0,
      docComment: i % 4 === 0 ? 'docs' : undefined,
    });
  }
  const edges: CodeEdge[] = [];
  for (let i = 1; i < n; i++) {
    edges.push({ from: `sym-${i}`, to: `sym-${i - 1}`, kind: 'call', weight: 1 });
    edges.push({ from: `sym-${i}`, to: `sym-${Math.floor(i / 2)}`, kind: 'import', weight: 1 });
  }
  return { nodes, edges };
}

describe('computePageRank (v1.1.0 Track 8 A5 — CSR/TypedArray)', () => {
  it('ranks symbols and sums to ~1.0 (parity with semantic expectations)', () => {
    const { nodes, edges } = makeGraph(2000);
    const ranks = computePageRank(nodes, edges);
    expect(ranks.size).toBe(nodes.length);

    const sum = [...ranks.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 2);

    // Root symbols (referenced by many) rank above leaves.
    const top = [...ranks.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(top?.[1]).toBeGreaterThan(1 / nodes.length);
  });

  it('handles empty inputs', () => {
    expect(computePageRank([], []).size).toBe(0);
  });

  it('handles self-loops and unknown edges gracefully', () => {
    const { nodes } = makeGraph(10);
    const edges: CodeEdge[] = [
      { from: 'sym-1', to: 'sym-1', kind: 'call', weight: 1 }, // self loop — ignored
      { from: 'ghost', to: 'sym-2', kind: 'call', weight: 1 }, // unknown node — ignored
    ];
    const ranks = computePageRank(nodes, edges);
    expect(ranks.size).toBe(10);
  });
});

describe('computePageRank — native addon path (v1.1.0 Track 8 A11)', () => {
  it('uses the registered codegraph pagerank when available', () => {
    registerNative('codegraph', {
      pagerank: (n: number) => {
        const out = new Float32Array(n);
        out.fill(1 / n);
        return out;
      },
    } as never);
    try {
      const { nodes, edges } = makeGraph(50);
      const ranks = computePageRank(nodes, edges);
      expect(ranks.size).toBe(50);
      // Native (uniform 1/n) wins → mọi rank bằng nhau.
      expect(ranks.get('sym-0')).toBeCloseTo(1 / 50, 5);
    } finally {
      unregisterNative('codegraph');
    }
  });
});
