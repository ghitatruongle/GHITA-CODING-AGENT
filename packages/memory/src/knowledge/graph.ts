import type { GraphNode, GraphEdge, EntityExtractionProvider } from './types.js';

export class KnowledgeGraph {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Map<string, GraphEdge>();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    this.edges.set(edge.id, edge);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getEdgesForNode(nodeId: string): GraphEdge[] {
    const result: GraphEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.sourceId === nodeId || edge.targetId === nodeId) {
        result.push(edge);
      }
    }
    return result;
  }

  searchNodesByName(nameQuery: string): GraphNode[] {
    const q = nameQuery.toLowerCase();
    const result: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.name.toLowerCase().includes(q)) {
        result.push(node);
      }
    }
    return result;
  }

  getGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  /**
   * Performs BFS traversal starting from a node.
   * Returns visited node IDs.
   */
  bfs(startNodeId: string, visitor?: (node: GraphNode) => void | boolean): string[] {
    const visited = new Set<string>();
    const queue: string[] = [startNodeId];
    const result: string[] = [];

    while (queue.length > 0) {
      const currentId = queue.shift() as string;
      if (visited.has(currentId)) continue;

      const node = this.getNode(currentId);
      if (!node) continue;

      visited.add(currentId);
      result.push(currentId);

      const stop = visitor?.(node);
      if (stop === true) break;

      const neighbors = this.getNeighbors(currentId);
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          queue.push(neighborId);
        }
      }
    }

    return result;
  }

  /**
   * Performs DFS traversal starting from a node.
   * Returns visited node IDs.
   */
  dfs(startNodeId: string, visitor?: (node: GraphNode) => void | boolean): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const traverse = (currentId: string): boolean => {
      if (visited.has(currentId)) return false;

      const node = this.getNode(currentId);
      if (!node) return false;

      visited.add(currentId);
      result.push(currentId);

      const stop = visitor?.(node);
      if (stop === true) return true;

      const neighbors = this.getNeighbors(currentId);
      for (const neighborId of neighbors) {
        if (traverse(neighborId)) return true;
      }
      return false;
    };

    traverse(startNodeId);
    return result;
  }

  /**
   * Helper to get neighbor node IDs for a given node.
   */
  private getNeighbors(nodeId: string): string[] {
    const neighbors = new Set<string>();
    const edges = this.getEdgesForNode(nodeId);
    for (const edge of edges) {
      if (edge.sourceId === nodeId) neighbors.add(edge.targetId);
      else neighbors.add(edge.sourceId);
    }
    return Array.from(neighbors);
  }

  /**
   * Calculates the centrality of all nodes using PageRank algorithm with weighted edges.
   */
  calculatePageRank(damping = 0.85, maxIterations = 100, tolerance = 1e-6): Map<string, number> {
    const nodeIds = Array.from(this.nodes.keys());
    const N = nodeIds.length;
    const pageRanks = new Map<string, number>();

    if (N === 0) return pageRanks;

    // Initialize PageRanks evenly: 1 / N
    for (const id of nodeIds) {
      pageRanks.set(id, 1 / N);
    }

    // Build incoming/outgoing weight cache for neighbors
    const neighborsMap = new Map<string, { id: string; weight: number }[]>();
    const outTotalWeights = new Map<string, number>();

    for (const nodeId of nodeIds) {
      const edges = this.getEdgesForNode(nodeId);
      const uniqueNeighbors = new Map<string, number>();

      for (const edge of edges) {
        const neighborId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId;
        const weight = edge.weight !== undefined ? Number(edge.weight) : 1;
        uniqueNeighbors.set(neighborId, (uniqueNeighbors.get(neighborId) || 0) + weight);
      }

      const neighborsList = Array.from(uniqueNeighbors.entries()).map(([id, weight]) => ({
        id,
        weight,
      }));
      neighborsMap.set(nodeId, neighborsList);

      const totalWeight = neighborsList.reduce((sum, n) => sum + n.weight, 0);
      outTotalWeights.set(nodeId, totalWeight);
    }

    // Power iteration
    for (let iter = 0; iter < maxIterations; iter++) {
      const nextRanks = new Map<string, number>();
      let diff = 0;

      // Compute rank from neighbors
      for (const nodeId of nodeIds) {
        let incomingRankSum = 0;

        // Treat as bidirectional graph
        for (const otherId of nodeIds) {
          if (otherId === nodeId) continue;

          const neighbors = neighborsMap.get(otherId) || [];
          const link = neighbors.find((n) => n.id === nodeId);
          if (link) {
            const outWeight = outTotalWeights.get(otherId) || 1;
            incomingRankSum += ((pageRanks.get(otherId) || 0) * link.weight) / outWeight;
          }
        }

        const newRank = (1 - damping) / N + damping * incomingRankSum;
        nextRanks.set(nodeId, newRank);
      }

      // Check convergence
      for (const id of nodeIds) {
        diff += Math.abs((nextRanks.get(id) || 0) - (pageRanks.get(id) || 0));
      }

      // Update values
      for (const id of nodeIds) {
        pageRanks.set(id, nextRanks.get(id) || 0);
      }

      if (diff < tolerance) {
        break;
      }
    }

    return pageRanks;
  }

  /**
   * Search nodes matching the query, with scores boosted by their PageRank centrality.
   */
  searchNodesWithPageRank(
    query: string,
    limit = 5,
    boostFactor = 10.0,
  ): { node: GraphNode; score: number }[] {
    const ranks = this.calculatePageRank();
    const matched = this.searchNodesByName(query);
    const results = matched.map((node) => {
      const rank = ranks.get(node.id) || 0;
      // Heuristic text match score based on query presence
      const textScore = node.name.toLowerCase() === query.toLowerCase() ? 1.0 : 0.5;
      const score = textScore * (1 + boostFactor * rank);
      return { node, score };
    });

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

export class EntityRelationExtractor {
  constructor(private provider: EntityExtractionProvider) {}

  async processText(text: string, graph: KnowledgeGraph): Promise<void> {
    const { nodes, edges } = await this.provider.extract(text);

    for (const node of nodes) {
      if (!graph.getNode(node.id)) {
        graph.addNode(node);
      }
    }

    for (const edge of edges) {
      graph.addEdge(edge);
    }
  }
}

export class GraphRAGQueryCompiler {
  constructor(private graph: KnowledgeGraph) {}

  compileQuery(query: string, maxDepth: number = 2): string {
    
    const tokens = query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3);

    const matchedNodes = new Set<GraphNode>();
    for (const token of tokens) {
      const nodes = this.graph.searchNodesByName(token);
      for (const n of nodes) matchedNodes.add(n);
    }

    if (matchedNodes.size === 0) return '';

    const visitedNodes = new Set<string>();
    const subEdges = new Set<GraphEdge>();

    const traverse = (nodeId: string, depth: number) => {
      if (depth > maxDepth || visitedNodes.has(nodeId)) return;
      visitedNodes.add(nodeId);

      const edges = this.graph.getEdgesForNode(nodeId);
      for (const e of edges) {
        subEdges.add(e);
        traverse(e.sourceId === nodeId ? e.targetId : e.sourceId, depth + 1);
      }
    };

    for (const node of matchedNodes) {
      traverse(node.id, 1);
    }

    const lines = ['=== KNOWLEDGE GRAPH CONTEXT ==='];
    for (const edge of subEdges) {
      const source = this.graph.getNode(edge.sourceId);
      const target = this.graph.getNode(edge.targetId);
      if (source && target) {
        lines.push(
          `- ${source.name} (${source.label}) [${edge.relation}] ${target.name} (${target.label})`,
        );
      }
    }

    return lines.length > 1 ? lines.join('\n') : '';
  }
}

export class ContextEnrichedPromptBuilder {
  static buildPrompt(userQuery: string, vectorContext: string, graphContext: string): string {
    const parts = [];

    if (vectorContext) {
      parts.push(vectorContext);
    }

    if (graphContext) {
      parts.push(graphContext);
    }

    parts.push(`\nUser Query: ${userQuery}`);

    if (parts.length > 1) {
      parts.unshift('Dựa vào các ngữ cảnh dưới đây, hãy trả lời truy vấn của người dùng:\n');
    }

    return parts.join('\n\n');
  }
}
