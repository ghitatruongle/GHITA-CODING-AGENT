// v0.4.9 A8: Repo-Map Ranking Unit Tests

import { describe, it, expect } from 'vitest';
import {
  computePageRank,
  getRepoMap,
  renderRepoMap,
  renderTreeRepoMap,
  RepoMapSessionService,
  injectRepoMapContext,
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
    const hub = ranks.get('hub');
    const a = ranks.get('a');
    const b = ranks.get('b');
    const c = ranks.get('c');
    expect(hub).toBeDefined();
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    expect(hub ?? 0).toBeGreaterThan(a ?? 0);
    expect(hub ?? 0).toBeGreaterThan(b ?? 0);
    expect(hub ?? 0).toBeGreaterThan(c ?? 0);
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
    expect(ranks.get('b') ?? 0).toBeGreaterThan(0);
  });
});

describe('getRepoMap', () => {
  it('includes the most important symbol first', () => {
    const nodes = [node('a'), node('b'), node('hub', { exported: true })];
    const edges = [edge('a', 'hub'), edge('b', 'hub')];
    const map = getRepoMap(nodes, edges, 10_000);
    expect(map.entries.at(0)?.id).toBe('hub');
    expect(map.totalSymbols).toBe(3);
  });

  it('respects the token budget', () => {
    const nodes = Array.from({ length: 50 }, (_, i) => node(`n${i}`, { excerpt: 'x'.repeat(400) }));
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
    const nodes = [node('z', { exported: false }), node('a', { exported: true })];
    const map = getRepoMap(nodes, [], 10_000);
    // equal rank → exported 'a' should come before 'z'
    expect(map.entries.at(0)?.id).toBe('a');
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

describe('renderTreeRepoMap', () => {
  it('renders hierarchical file and symbol tree view', () => {
    const nodes = [
      node('login', { filePath: '/workspace/src/auth.ts', kind: 'function', startLine: 10 }),
      node('verify', { filePath: '/workspace/src/auth.ts', kind: 'function', startLine: 30 }),
      node('User', { filePath: '/workspace/src/models/user.ts', kind: 'class', startLine: 5 }),
    ];
    const map = getRepoMap(nodes, [], 2000);
    const tree = renderTreeRepoMap(map, { rootDir: '/workspace' });

    expect(tree).toContain('# Repository Map');
    expect(tree).toContain('src/auth.ts:');
    expect(tree).toContain('function login (L10)');
    expect(tree).toContain('function verify (L30)');
    expect(tree).toContain('src/models/user.ts:');
    expect(tree).toContain('class User (L5)');
  });
});

describe('RepoMapSessionService', () => {
  it('generates session repo map with caching and respects <2000 token budget', () => {
    const service = new RepoMapSessionService();
    const nodes: CodeNode[] = [];
    for (let i = 0; i < 50; i++) {
      nodes.push(
        node(`symbol_${i}`, {
          filePath: `/workspace/src/module_${Math.floor(i / 5)}.ts`,
          kind: i % 2 === 0 ? 'function' : 'class',
          startLine: i * 10,
          indexedAt: 1000,
        }),
      );
    }

    // 1. Initial generation
    const res1 = service.generateSessionRepoMap(nodes, [], 2000, { rootDir: '/workspace' });
    expect(res1.fromCache).toBe(false);
    expect(res1.tokensEstimate).toBeLessThanOrEqual(2000);
    expect(res1.renderedText).toContain('# Repository Map');

    // 2. Cached retrieval
    const res2 = service.generateSessionRepoMap(nodes, [], 2000, { rootDir: '/workspace' });
    expect(res2.fromCache).toBe(true);
    expect(res2.renderedText).toBe(res1.renderedText);

    // 3. Context prompt injection
    const prompt = injectRepoMapContext(res1.renderedText);
    expect(prompt.role).toBe('system');
    expect(prompt.content).toContain('<repository_map>');
    expect(prompt.content).toContain('</repository_map>');
  });
});

describe('estimateTokens', () => {
  it('approximates ~4 chars per token', () => {
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });
});
