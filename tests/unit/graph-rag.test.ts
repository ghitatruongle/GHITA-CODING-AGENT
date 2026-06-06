import { describe, it, expect, vi } from 'vitest';
import {
  KnowledgeGraph,
  EntityRelationExtractor,
  GraphRAGQueryCompiler,
  ContextEnrichedPromptBuilder,
} from '../../packages/memory/src/knowledge/graph.js';
import type { EntityExtractionProvider } from '../../packages/memory/src/knowledge/types.js';

describe('15: Knowledge Graph RAG', () => {
  describe('KnowledgeGraph', () => {
    it('should add and retrieve nodes', () => {
      const graph = new KnowledgeGraph();
      graph.addNode({ id: 'n1', label: 'Person', name: 'Alice' });
      expect(graph.getNode('n1')?.name).toBe('Alice');
      expect(graph.searchNodesByName('alice').length).toBe(1);
    });

    it('should add and retrieve edges', () => {
      const graph = new KnowledgeGraph();
      graph.addNode({ id: 'n1', label: 'Person', name: 'Alice' });
      graph.addNode({ id: 'n2', label: 'Person', name: 'Bob' });
      graph.addEdge({ id: 'e1', sourceId: 'n1', targetId: 'n2', relation: 'KNOWS' });

      const edges = graph.getEdgesForNode('n1');
      expect(edges.length).toBe(1);
      expect(edges[0].relation).toBe('KNOWS');
    });
  });

  describe('EntityRelationExtractor', () => {
    it('should extract and populate graph', async () => {
      const mockProvider: EntityExtractionProvider = {
        extract: async () => ({
          nodes: [{ id: 'n1', label: 'Concept', name: 'GraphRAG' }],
          edges: [],
        }),
      };

      const extractor = new EntityRelationExtractor(mockProvider);
      const graph = new KnowledgeGraph();
      await extractor.processText('GraphRAG is cool', graph);

      expect(graph.getNode('n1')).toBeDefined();
    });
  });

  describe('GraphRAGQueryCompiler', () => {
    it('should compile query context from subgraph', () => {
      const graph = new KnowledgeGraph();
      graph.addNode({ id: 'n1', label: 'Company', name: 'Google' });
      graph.addNode({ id: 'n2', label: 'Product', name: 'Android' });
      graph.addEdge({ id: 'e1', sourceId: 'n1', targetId: 'n2', relation: 'DEVELOPS' });

      const compiler = new GraphRAGQueryCompiler(graph);
      const context = compiler.compileQuery('who develops android?');

      expect(context).toContain('=== KNOWLEDGE GRAPH CONTEXT ===');
      expect(context).toContain('Google');
      expect(context).toContain('Android');
      expect(context).toContain('DEVELOPS');
    });

    it('should return empty if no matches', () => {
      const graph = new KnowledgeGraph();
      const compiler = new GraphRAGQueryCompiler(graph);
      const context = compiler.compileQuery('random search');
      expect(context).toBe('');
    });
  });

  describe('ContextEnrichedPromptBuilder', () => {
    it('should build prompt combining vector and graph context', () => {
      const prompt = ContextEnrichedPromptBuilder.buildPrompt(
        'What is Android?',
        'Vector says it is an OS.',
        'Graph says Google DEVELOPS Android',
      );

      expect(prompt).toContain('Dựa vào các ngữ cảnh dưới đây');
      expect(prompt).toContain('Vector says');
      expect(prompt).toContain('Graph says');
      expect(prompt).toContain('User Query: What is Android?');
    });
  });

  describe('Graph Centrality & Search (Phase 21)', () => {
    it('should perform BFS traversal correctly', () => {
      const graph = new KnowledgeGraph();
      graph.addNode({ id: 'A', label: 'L', name: 'Node A' });
      graph.addNode({ id: 'B', label: 'L', name: 'Node B' });
      graph.addNode({ id: 'C', label: 'L', name: 'Node C' });
      graph.addNode({ id: 'D', label: 'L', name: 'Node D' });

      graph.addEdge({ id: 'e1', sourceId: 'A', targetId: 'B', relation: 'L' });
      graph.addEdge({ id: 'e2', sourceId: 'A', targetId: 'C', relation: 'L' });
      graph.addEdge({ id: 'e3', sourceId: 'B', targetId: 'D', relation: 'L' });

      const visited = graph.bfs('A');
      // BFS order: A -> B -> C -> D (since B and C are neighbors of A, and D is neighbor of B)
      expect(visited).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should perform DFS traversal correctly', () => {
      const graph = new KnowledgeGraph();
      graph.addNode({ id: 'A', label: 'L', name: 'Node A' });
      graph.addNode({ id: 'B', label: 'L', name: 'Node B' });
      graph.addNode({ id: 'C', label: 'L', name: 'Node C' });
      graph.addNode({ id: 'D', label: 'L', name: 'Node D' });

      graph.addEdge({ id: 'e1', sourceId: 'A', targetId: 'B', relation: 'L' });
      graph.addEdge({ id: 'e2', sourceId: 'B', targetId: 'D', relation: 'L' });
      graph.addEdge({ id: 'e3', sourceId: 'A', targetId: 'C', relation: 'L' });

      const visited = graph.dfs('A');
      // DFS order: A -> B -> D -> C (depth first)
      expect(visited).toEqual(['A', 'B', 'D', 'C']);
    });

    it('should calculate PageRank centrality and converge', () => {
      const graph = new KnowledgeGraph();
      graph.addNode({ id: 'A', label: 'L', name: 'Node A' });
      graph.addNode({ id: 'B', label: 'L', name: 'Node B' });
      graph.addNode({ id: 'C', label: 'L', name: 'Node C' });

      // Build weighted associations (bidirectional)
      graph.addEdge({ id: 'e1', sourceId: 'A', targetId: 'B', relation: 'L', weight: 2 });
      graph.addEdge({ id: 'e2', sourceId: 'B', targetId: 'C', relation: 'L', weight: 1 });

      const ranks = graph.calculatePageRank(0.85, 50, 1e-6);
      expect(ranks.size).toBe(3);
      
      const rankA = ranks.get('A') || 0;
      const rankB = ranks.get('B') || 0;
      const rankC = ranks.get('C') || 0;

      // Node B is connected to both A and C, and A has higher link weight to B.
      // So Node B should have the highest PageRank centrality.
      expect(rankB).toBeGreaterThan(rankA);
      expect(rankB).toBeGreaterThan(rankC);
      
      // Sum of ranks should be approximately 1.0
      const sum = rankA + rankB + rankC;
      expect(sum).toBeCloseTo(1.0, 4);
    });

    it('should boost search results by PageRank centrality', () => {
      const graph = new KnowledgeGraph();
      // Three nodes all matching "Node" in name, but B is central, C is intermediate, A is isolated.
      graph.addNode({ id: 'A', label: 'L', name: 'Node A' });
      graph.addNode({ id: 'B', label: 'L', name: 'Node B' });
      graph.addNode({ id: 'C', label: 'L', name: 'Node C' });

      graph.addEdge({ id: 'e1', sourceId: 'B', targetId: 'C', relation: 'L', weight: 10 });

      const results = graph.searchNodesWithPageRank('Node', 3, 10.0);
      expect(results.length).toBe(3);
      // B and C are connected with high weight, B and C should rank higher than A
      expect(results[0].node.id === 'B' || results[0].node.id === 'C').toBe(true);
    });
  });
});
