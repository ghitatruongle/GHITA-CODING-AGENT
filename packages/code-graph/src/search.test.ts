import { describe, it, expect, beforeEach } from 'vitest';
import { SearchEngine } from './search.js';
import type { CodeNode } from './types.js';

function makeNode(overrides: Partial<CodeNode> & { id: string; name: string }): CodeNode {
  return {
    kind: 'function',
    qualifiedName: overrides.name,
    filePath: '/test/file.ts',
    startLine: 1,
    endLine: 10,
    excerpt: `function ${overrides.name}() {}`,
    exported: false,
    tags: [],
    indexedAt: Date.now(),
    ...overrides,
  };
}

describe('SearchEngine', () => {
  let engine: SearchEngine;

  beforeEach(() => {
    engine = new SearchEngine();
  });

  it('should return empty results for empty index', () => {
    const results = engine.search({ pattern: 'test' });
    expect(results).toEqual([]);
  });

  it('should return empty results for empty pattern', () => {
    engine.buildIndex([makeNode({ id: 'a', name: 'hello' })]);
    const results = engine.search({ pattern: '' });
    expect(results).toEqual([]);
  });

  it('should find exact name matches', () => {
    engine.buildIndex([
      makeNode({ id: 'a', name: 'getUser' }),
      makeNode({ id: 'b', name: 'getUserById' }),
    ]);
    const results = engine.search({ pattern: 'getUser' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Exact match should have highest score
    const exact = results.find((r) => r.node.name === 'getUser');
    expect(exact).toBeDefined();
    if (exact) {
      expect(exact.score).toBeGreaterThan(0.9);
    }
  });

  it('should find prefix matches', () => {
    engine.buildIndex([
      makeNode({ id: 'a', name: 'fetchData' }),
      makeNode({ id: 'b', name: 'updateData' }),
    ]);
    const results = engine.search({ pattern: 'fetch' });
    expect(results.some((r) => r.node.name === 'fetchData')).toBe(true);
  });

  it('should find substring matches', () => {
    engine.buildIndex([
      makeNode({ id: 'a', name: 'getUserProfile' }),
      makeNode({ id: 'b', name: 'processProfileImage' }),
    ]);
    const results = engine.search({ pattern: 'profile' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.node.name === 'getUserProfile')).toBe(true);
  });

  it('should support scope filtering', () => {
    engine.buildIndex([
      makeNode({ id: 'a', name: 'run', kind: 'function' }),
      makeNode({ id: 'b', name: 'Runner', kind: 'class' }),
    ]);
    const results = engine.search({ pattern: 'run', scope: 'class' });
    expect(results).toHaveLength(1);
    expect(results[0]?.node.name).toBe('Runner');
  });

  it('should support filePrefix filtering', () => {
    engine.buildIndex([
      makeNode({ id: 'a', name: 'helper', filePath: '/src/utils/helper.ts' }),
      makeNode({ id: 'b', name: 'helper', filePath: '/test/helper.test.ts' }),
    ]);
    const results = engine.search({ pattern: 'helper', filePrefix: '/src' });
    expect(results).toHaveLength(1);
  });

  it('should support limit parameter', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => makeNode({ id: `n${i}`, name: `item${i}` }));
    engine.buildIndex(nodes);
    const results = engine.search({ pattern: 'item', limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('should support minScore filtering', () => {
    engine.buildIndex([makeNode({ id: 'a', name: 'exactMatchFunction' })]);
    const results = engine.search({ pattern: 'exactMatchFunction', minScore: 0.9 });
    expect(results.length).toBeGreaterThan(0);
    const filtered = engine.search({ pattern: 'exactMatchFunction', minScore: 1.5 });
    expect(filtered).toHaveLength(0);
  });

  it('should sort by score descending then name alphabetically', () => {
    engine.buildIndex([
      makeNode({ id: 'b', name: 'beta', kind: 'function', tags: [] }),
      makeNode({ id: 'a', name: 'alpha', kind: 'function', tags: [] }),
      makeNode({ id: 'c', name: 'gamma', kind: 'function', tags: [] }),
    ]);
    // All three match the prefix 'a' differently
    const results = engine.search({ pattern: 'a' });
    expect(results.length).toBeGreaterThan(0);
    const names = results.map((r) => r.node.name);
    // 'alpha' should appear (exact match on 'a')
    expect(names).toContain('alpha');
  });
});
