// ==============================================================================
// v0.4.9 A8: Repo-Map Ranking Unit Tests
// ==============================================================================

import { describe, it, expect } from 'vitest';
import {
  computePageRank,
  getRepoMap,
  renderRepoMap,
  estimateTokens,
} from './repo-map.js';
import type { CodeNode, CodeEdge } from './types.js';

function node(id: string, over: Partial<CodeNode> = {}): CodeNode {
  return {
    id,
    kind: 'function',
    name: id,
    qualifiedName: id,
    filePath: `src/${id}.ts`,
    startLine: 1,
    endLine: 10,
    excerpt: `function ${id}() {}`,
    exported: false,
    tags: [],
    indexedAt: 0,
    ...over,
  };
}

function edge(from: string, to: string, kind: CodeEdge['kind'] = 'call'): CodeEdge {
  return { from, to, kind, weight: 1 };
}

describe('computePageRank', () => {
  it('returns empty for no nodes', () => {
    expect(computePageRank([], []).size).toBe(0);
  });

  it('ranks a highly-referenced node above others', () => {
    const nodes = [node('a'), node('b'), node('c'), node('hub')];
    // a, b, c all call hub → hub should rank highest.
    const edges = [edge('a', 'hub'), edge('b', 'hub'), edge('c', 'hub')];
    const ranks = computePageRank(nodes, edges);
    const hub = ranks.get('hub')!;
    expect(hub).toBeGreaterThan(ranks.get('a')!);
    expect(hub).toBeGreaterThan(ranks.get('b')!);
    expect(hub).toBeGreaterThan(ranks.get('c')!);
  });

  it('scores sum to approximately 1', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];
    const ranks = computePageRank(nodes, edges);
    const sum = [...ranks.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 1);
  });

  it('ignores edges to unknown nodes and self-loops', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('a', 'ghost'), edge('a', 'a'), edge('a', 'b')];
    const ranks = computePageRank(nodes, edges);
    expect(ranks.get('b')!).toBeGreaterThan(0);
  });
});

describe('getRepoMap', () => {
  it('includes the most important symbol first', () => {
    const nodes = [node('a'), node('b'), node('hub', { exported: true })];
    const edges = [edge('a', 'hub'), edge('b', 'hub')];
    const map = getRepoMap(nodes, edges, 10_000);
    expect(map.entries[0]!.id).toBe('hub');
    expect(map.totalSymbols).toBe(3);
  });

  it('respects the token budget', () => {
    const nodes = Array.from({ length: 50 }, (_, i) =>
      node(`n${i}`, { excerpt: 'x'.repeat(400) }),
    );
    const edges: CodeEdge[] = [];
    const map = getRepoMap(nodes, edges, 200);
    // Each excerpt ~100 tokens; budget 200 → only a couple fit.
    expect(map.entries.length).toBeGreaterThan(0);
    expect(map.entries.length).toBeLessThan(nodes.length);
    expect(map.usedTokens).toBeLessThanOrEqual(200 + 100);
  });

  it('always includes at least one entry even if over budget', () => {
    const nodes = [node('big', { excerpt: 'y'.repeat(10_000) })];
    const map = getRepoMap(nodes, [], 10);
    expect(map.entries).toHaveLength(1);
  });

  it('breaks exported/documented ties deterministically', () => {
    const nodes = [
      node('z', { exported: false }),
      node('a', { exported: true }),
    ];
    const map = getRepoMap(nodes, [], 10_000);
    // equal rank → exported 'a' should come before 'z'
    expect(map.entries[0]!.id).toBe('a');
  });
});

describe('renderRepoMap', () => {
  it('renders a header and symbol sections', () => {
    const nodes = [node('main', { exported: true })];
    const md = renderRepoMap(getRepoMap(nodes, [], 1000));
    expect(md).toContain('# Repo map');
    expect(md).toContain('## main');
  });
});

describe('estimateTokens', () => {
  it('approximates ~4 chars per token', () => {
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });
});
