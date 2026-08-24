import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph } from './knowledge-graph.js';
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

describe('KnowledgeGraph', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();
  });

  describe('addNode / getNode', () => {
    it('should add and retrieve a node', () => {
      const node = makeNode({ id: 'fn1', name: 'hello' });
      graph.addNode(node);
      expect(graph.getNode('fn1')).toBeDefined();
      expect(graph.getNode('fn1')?.name).toBe('hello');
    });

    it('should return undefined for unknown node', () => {
      expect(graph.getNode('nonexistent')).toBeUndefined();
    });
  });

  describe('addEdge / getEdgesFrom / getEdgesTo', () => {
    it('should add an edge between nodes', () => {
      graph.addNode(makeNode({ id: 'a', name: 'funcA' }));
      graph.addNode(makeNode({ id: 'b', name: 'funcB' }));
      graph.addEdge({ from: 'a', to: 'b', kind: 'references', weight: 1.0 });

      const fromA = graph.getEdgesFrom('a');
      expect(fromA).toHaveLength(1);
      expect(fromA[0]?.kind).toBe('references');
      expect(fromA[0]?.to).toBe('b');

      const toB = graph.getEdgesTo('b');
      expect(toB).toHaveLength(1);
      expect(toB[0]?.from).toBe('a');
    });

    it('should return empty arrays for unknown nodes', () => {
      expect(graph.getEdgesFrom('x')).toEqual([]);
      expect(graph.getEdgesTo('x')).toEqual([]);
    });
  });

  describe('removeFile', () => {
    it('should remove all nodes and edges for a file', () => {
      graph.addNode(makeNode({ id: 'a', name: 'funcA', filePath: '/test/a.ts' }));
      graph.addNode(makeNode({ id: 'b', name: 'funcB', filePath: '/test/b.ts' }));
      graph.addEdge({ from: 'a', to: 'b', kind: 'references', weight: 1.0 });
      graph.removeFile('/test/a.ts');
      expect(graph.getNode('a')).toBeUndefined();
      expect(graph.getNode('b')).toBeDefined();
      expect(graph.getAllEdges()).toHaveLength(0);
    });
  });

  describe('getDependencies / getDependents', () => {
    it('should return imported/referenced nodes', () => {
      graph.addNode(makeNode({ id: 'a', name: 'funcA', filePath: '/a.ts', kind: 'module' }));
      graph.addNode(makeNode({ id: 'b', name: 'funcB', filePath: '/b.ts', kind: 'module' }));
      graph.addEdge({ from: 'a', to: 'b', kind: 'import', weight: 0.8, line: 1 });
      const deps = graph.getDependencies('a');
      expect(deps).toHaveLength(1);
      expect(deps[0]?.id).toBe('b');
    });

    it('should return dependents', () => {
      graph.addNode(makeNode({ id: 'a', name: 'funcA', filePath: '/a.ts', kind: 'module' }));
      graph.addNode(makeNode({ id: 'b', name: 'funcB', filePath: '/b.ts', kind: 'module' }));
      graph.addEdge({ from: 'a', to: 'b', kind: 'import', weight: 0.8 });
      const deps = graph.getDependents('b');
      expect(deps).toHaveLength(1);
      expect(deps[0]?.id).toBe('a');
    });
  });

  describe('getChildren', () => {
    it('should return child nodes via contains edges', () => {
      graph.addNode(makeNode({ id: 'parent', name: 'MyClass', kind: 'class' }));
      graph.addNode(makeNode({ id: 'child1', name: 'method1', kind: 'method' }));
      graph.addEdge({ from: 'parent', to: 'child1', kind: 'contains', weight: 1.0 });
      const children = graph.getChildren('parent');
      expect(children).toHaveLength(1);
      expect(children[0]?.id).toBe('child1');
    });
  });

  describe('getNodesByKind', () => {
    it('should filter nodes by kind', () => {
      graph.addNode(makeNode({ id: 'fn1', name: 'fn1', kind: 'function' }));
      graph.addNode(makeNode({ id: 'cls1', name: 'cls1', kind: 'class' }));
      graph.addNode(makeNode({ id: 'int1', name: 'int1', kind: 'interface' }));
      const functions = graph.getNodesByKind('function');
      expect(functions).toHaveLength(1);
      expect(functions[0]?.id).toBe('fn1');
    });
  });

  describe('stats', () => {
    it('should return correct statistics', () => {
      graph.addNode(makeNode({ id: 'a', name: 'a', filePath: '/test.ts' }));
      graph.addNode(makeNode({ id: 'b', name: 'b', filePath: '/other.ts' }));
      graph.addNode(makeNode({ id: 'c', name: 'c', filePath: '/test.ts' }));
      graph.addEdge({ from: 'a', to: 'b', kind: 'references', weight: 1.0 });
      const s = graph.stats();
      expect(s.nodes).toBe(3);
      expect(s.edges).toBe(1);
      expect(s.files).toBe(2);
    });
  });

  describe('BFS traversal', () => {
    it('should traverse breadth-first', () => {
      graph.addNode(makeNode({ id: 'root', name: 'root' }));
      graph.addNode(makeNode({ id: 'a', name: 'a' }));
      graph.addNode(makeNode({ id: 'b', name: 'b' }));
      graph.addNode(makeNode({ id: 'c', name: 'c' }));
      graph.addEdge({ from: 'root', to: 'a', kind: 'references', weight: 1.0 });
      graph.addEdge({ from: 'root', to: 'b', kind: 'references', weight: 1.0 });
      graph.addEdge({ from: 'b', to: 'c', kind: 'references', weight: 1.0 });
      const result = graph.bfs('root', 2);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.map((n) => n.id)).toContain('a');
      expect(result.map((n) => n.id)).toContain('b');
    });
  });

  describe('DFS traversal', () => {
    it('should traverse depth-first', () => {
      graph.addNode(makeNode({ id: 'root', name: 'root' }));
      graph.addNode(makeNode({ id: 'a', name: 'a' }));
      graph.addNode(makeNode({ id: 'b', name: 'b' }));
      graph.addEdge({ from: 'root', to: 'a', kind: 'references', weight: 1.0 });
      graph.addEdge({ from: 'a', to: 'b', kind: 'references', weight: 1.0 });
      const result = graph.dfs('root', 3);
      expect(result.some((n) => n.id === 'b')).toBe(true);
    });
  });

  describe('findPath', () => {
    it('should find shortest path between nodes', () => {
      graph.addNode(makeNode({ id: 'a', name: 'a' }));
      graph.addNode(makeNode({ id: 'b', name: 'b' }));
      graph.addNode(makeNode({ id: 'c', name: 'c' }));
      graph.addEdge({ from: 'a', to: 'b', kind: 'references', weight: 1.0 });
      graph.addEdge({ from: 'b', to: 'c', kind: 'references', weight: 1.0 });
      const path = graph.findPath('a', 'c');
      expect(path).toEqual(['a', 'b', 'c']);
    });

    it('should return null when no path exists', () => {
      graph.addNode(makeNode({ id: 'a', name: 'a' }));
      graph.addNode(makeNode({ id: 'b', name: 'b' }));
      const path = graph.findPath('a', 'b');
      expect(path).toBeNull();
    });
  });

  describe('detectCycles', () => {
    it('should detect cycles in the graph', () => {
      graph.addNode(makeNode({ id: 'a', name: 'a' }));
      graph.addNode(makeNode({ id: 'b', name: 'b' }));
      graph.addNode(makeNode({ id: 'c', name: 'c' }));
      graph.addEdge({ from: 'a', to: 'b', kind: 'references', weight: 1.0 });
      graph.addEdge({ from: 'b', to: 'c', kind: 'references', weight: 1.0 });
      graph.addEdge({ from: 'c', to: 'a', kind: 'references', weight: 1.0 });
      const cycles = graph.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should return empty array if no cycles', () => {
      graph.addNode(makeNode({ id: 'a', name: 'a' }));
      graph.addNode(makeNode({ id: 'b', name: 'b' }));
      graph.addEdge({ from: 'a', to: 'b', kind: 'references', weight: 1.0 });
      const cycles = graph.detectCycles();
      expect(cycles).toEqual([]);
    });
  });

  describe('toJSON / fromJSON', () => {
    it('should serialize and deserialize', () => {
      graph.addNode(makeNode({ id: 'a', name: 'a' }));
      graph.addNode(makeNode({ id: 'b', name: 'b' }));
      graph.addEdge({ from: 'a', to: 'b', kind: 'references', weight: 1.0 });
      const json = graph.toJSON();
      const restored = KnowledgeGraph.fromJSON(json);
      expect(restored.getNode('a')).toBeDefined();
      expect(restored.getNode('b')).toBeDefined();
      expect(restored.getAllEdges()).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should remove all nodes and edges', () => {
      graph.addNode(makeNode({ id: 'a', name: 'a' }));
      graph.addNode(makeNode({ id: 'b', name: 'b' }));
      graph.addEdge({ from: 'a', to: 'b', kind: 'references', weight: 1.0 });
      graph.clear();
      expect(graph.stats().nodes).toBe(0);
      expect(graph.stats().edges).toBe(0);
    });
  });
});
