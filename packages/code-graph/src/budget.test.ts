import { describe, it, expect } from 'vitest';
import { IndexBudgetTracker, estimateNodeBytes } from './budget.js';
import type { CodeNode, CodeEdge } from './types.js';

function node(id: string): CodeNode {
  return {
    id,
    kind: 'function',
    name: id,
    qualifiedName: `pkg::${id}`,
    filePath: `src/${id}.ts`,
    startLine: 1,
    endLine: 2,
    excerpt: 'export function x() {}',
    exported: false,
  };
}

describe('IndexBudgetTracker (v1.1.0 Track 9 B4)', () => {
  it('estimates bytes and flags over-cap with spill suggestion', () => {
    const tracker = new IndexBudgetTracker({ maxBytes: estimateNodeBytes(node('a')) * 5 });
    const nodes = Array.from({ length: 6 }, (_, i) => node(`n${i}`));
    const ok = tracker.addBatch(nodes, []);
    expect(ok).toBe(false); // 6 nodes > cap 5
    const state = tracker.state();
    expect(state.over).toBe(true);
    expect(state.spillSuggestion).toBe(true);
    expect(state.nodes).toBe(6);
  });

  it('evicts nodes and returns under budget', () => {
    const tracker = new IndexBudgetTracker({ maxBytes: 10_000 });
    const nodes = Array.from({ length: 10 }, (_, i) => node(`n${i}`));
    tracker.addBatch(nodes, []);
    const dropped: string[] = [];
    const state = tracker.evict(4, (ids) => dropped.push(...ids), nodes);
    expect(dropped).toHaveLength(4);
    expect(state.nodes).toBe(6);
    expect(state.over).toBe(false);
  });

  it('reports empty state', () => {
    const tracker = new IndexBudgetTracker();
    const s = tracker.state();
    expect(s.bytes).toBe(0);
    expect(s.over).toBe(false);
  });

  it('accounts edges', () => {
    const tracker = new IndexBudgetTracker({ maxBytes: 10_000 });
    const edges: CodeEdge[] = [{ from: 'a', to: 'b', kind: 'call', weight: 1 }];
    tracker.addBatch([node('a'), node('b')], edges);
    expect(tracker.state().edges).toBe(1);
  });
});
