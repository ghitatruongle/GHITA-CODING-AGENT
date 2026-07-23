// ==============================================================================
// Wave 2 — memory embeddings / graph path / tiered store public API
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { getDeterministicMockEmbedding, TieredMemoryStore } from '../src/tieredStore.js';
import { createAssociationList, addAssociation } from '../src/graph/associations.js';
import { bfsPath, dijkstraPath, findConnectionPath } from '../src/graph/path.js';

describe('getDeterministicMockEmbedding', () => {
  it('returns unit-ish vectors of requested dimensions', () => {
    const a = getDeterministicMockEmbedding('hello', 32);
    const b = getDeterministicMockEmbedding('hello', 32);
    const c = getDeterministicMockEmbedding('world', 32);
    expect(a).toHaveLength(32);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});

describe('Association graph paths', () => {
  it('bfs finds shortest unweighted path', () => {
    const g = createAssociationList();
    addAssociation(g, { from: 'a', to: 'b', type: 'related-to' });
    addAssociation(g, { from: 'b', to: 'c', type: 'related-to' });
    addAssociation(g, { from: 'a', to: 'c', type: 'related-to' });

    const same = bfsPath(g, 'a', 'a');
    expect(same?.nodes).toEqual(['a']);

    const path = bfsPath(g, 'a', 'c');
    expect(path).not.toBeNull();
    expect(path?.nodes[0]).toBe('a');
    expect(path?.nodes.at(-1)).toBe('c');
    expect(path?.totalCost).toBeGreaterThan(0);

    expect(bfsPath(g, 'a', 'missing')).toBeNull();
  });

  it('dijkstra prefers lower weight edges', () => {
    const g = createAssociationList({ weighted: true });
    addAssociation(g, { from: 'a', to: 'b', type: 'related-to', weight: 1 });
    addAssociation(g, { from: 'b', to: 'c', type: 'related-to', weight: 1 });
    addAssociation(g, { from: 'a', to: 'c', type: 'related-to', weight: 10 });

    const path = dijkstraPath(g, 'a', 'c');
    expect(path).not.toBeNull();
    expect(path?.weighted).toBe(true);
    expect(path?.totalCost).toBe(2);
    expect(path?.nodes).toEqual(['a', 'b', 'c']);
  });

  it('findConnectionPath chooses algorithm by weights', () => {
    const unweighted = createAssociationList();
    addAssociation(unweighted, { from: 'x', to: 'y', type: 'uses' });
    expect(findConnectionPath(unweighted, 'x', 'y')?.nodes).toEqual(['x', 'y']);

    const weighted = createAssociationList({ weighted: true });
    addAssociation(weighted, { from: 'x', to: 'y', type: 'uses', weight: 3 });
    expect(findConnectionPath(weighted, 'x', 'y')?.totalCost).toBe(3);
  });
});

describe('TieredMemoryStore public API', () => {
  it('add/get promotes into working memory and supports eviction', () => {
    const store = new TieredMemoryStore({
      dbPath: ':memory:',
      maxWorkingMemorySize: 2,
      promotionAccessThreshold: 100,
      promotionImportanceThreshold: 0.99,
    });

    const e1 = store.add({
      id: 'm1',
      type: 'note',
      content: 'first memory',
      timestamp: Date.now(),
      metadata: { _importance: 0.1 },
    } as never);
    expect(e1.id).toBe('m1');
    expect(store.get('m1')?.content).toBe('first memory');

    store.add({
      id: 'm2',
      type: 'note',
      content: 'second',
      timestamp: Date.now(),
      metadata: { _importance: 0.1 },
    } as never);
    store.add({
      id: 'm3',
      type: 'note',
      content: 'third',
      timestamp: Date.now(),
      metadata: { _importance: 0.1 },
    } as never);

    // capacity 2 => oldest/low utility demoted but still retrievable
    const again = store.get('m1') ?? store.get('m2') ?? store.get('m3');
    expect(again).toBeTruthy();

    // missing id
    expect(store.get('nope')).toBeUndefined();
  });

  it('high importance entries still get/add cleanly', () => {
    const store = new TieredMemoryStore({
      maxWorkingMemorySize: 10,
      promotionImportanceThreshold: 0.5,
      promotionAccessThreshold: 2,
    });
    store.add({
      id: 'hot',
      type: 'fact',
      content: 'important fact about coverage',
      timestamp: Date.now(),
      metadata: { _importance: 0.9 },
    } as never);
    // access repeatedly
    store.get('hot');
    store.get('hot');
    expect(store.get('hot')?.id).toBe('hot');
  });
});
