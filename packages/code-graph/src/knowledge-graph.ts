// ==============================================================================
// GHITA CODING AGENT - Phase 13: Knowledge Graph
// ==============================================================================
// In-memory graph structure with adjacency lists, traversal, and cycle detection.
// ==============================================================================

import type { CodeNode, CodeEdge, DependencyGraph, ImportInfo } from './types.js';

/**
 * In-memory knowledge graph for code entities.
 */
export class KnowledgeGraph {
  private graph: DependencyGraph;

  constructor() {
    this.graph = {
      nodes: new Map(),
      edges: [],
      adjacency: new Map(),
      reverseAdjacency: new Map(),
    };
  }

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  /**
   * Add or update a node in the graph.
   */
  addNode(node: CodeNode): void {
    this.graph.nodes.set(node.id, node);
    if (!this.graph.adjacency.has(node.id)) {
      this.graph.adjacency.set(node.id, []);
    }
    if (!this.graph.reverseAdjacency.has(node.id)) {
      this.graph.reverseAdjacency.set(node.id, []);
    }
  }

  /**
   * Add a batch of nodes.
   */
  addNodes(nodes: CodeNode[]): void {
    for (const node of nodes) {
      this.addNode(node);
    }
  }

  /**
   * Add an edge to the graph.
   */
  addEdge(edge: CodeEdge): void {
    const idx = this.graph.edges.length;
    this.graph.edges.push(edge);

    const adj = this.graph.adjacency.get(edge.from);
    if (adj) adj.push(idx);
    else this.graph.adjacency.set(edge.from, [idx]);

    const rev = this.graph.reverseAdjacency.get(edge.to);
    if (rev) rev.push(idx);
    else this.graph.reverseAdjacency.set(edge.to, [idx]);
  }

  /**
   * Add a batch of edges.
   */
  addEdges(edges: CodeEdge[]): void {
    for (const edge of edges) {
      this.addEdge(edge);
    }
  }

  /**
   * Build import edges from parsed import info.
   * Resolves module specifiers to node ids where possible.
   */
  buildImportEdges(imports: ImportInfo[]): void {
    for (const imp of imports) {
      const sourceModuleId = this.findModuleNode(imp.sourceFile);
      if (!sourceModuleId) continue;

      // Try to resolve the import target
      const targetModuleId = this.resolveImportTarget(imp.moduleSpecifier, imp.sourceFile);

      if (targetModuleId) {
        this.addEdge({
          from: sourceModuleId,
          to: targetModuleId,
          kind: 'import',
          weight: imp.isTypeOnly ? 0.3 : 0.8,
          line: imp.line,
        });
      }

      // Add reference edges for named imports
      for (const named of imp.namedImports) {
        const targetNode = this.findNodeByName(named);
        if (targetNode) {
          this.addEdge({
            from: sourceModuleId,
            to: targetNode.id,
            kind: 'references',
            weight: imp.isTypeOnly ? 0.2 : 0.6,
            line: imp.line,
          });
        }
      }
    }
  }

  /**
   * Remove all nodes and edges for a given file.
   */
  removeFile(filePath: string): void {
    const nodeIdsToRemove = new Set<string>();

    for (const [id, node] of this.graph.nodes) {
      if (node.filePath === filePath) {
        nodeIdsToRemove.add(id);
      }
    }

    // Remove edges referencing these nodes
    this.graph.edges = this.graph.edges.filter(
      (e) => !nodeIdsToRemove.has(e.from) && !nodeIdsToRemove.has(e.to),
    );

    // Rebuild adjacency lists
    this.rebuildAdjacency();

    // Remove nodes
    for (const id of nodeIdsToRemove) {
      this.graph.nodes.delete(id);
      this.graph.adjacency.delete(id);
      this.graph.reverseAdjacency.delete(id);
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Get a node by id */
  getNode(id: string): CodeNode | undefined {
    return this.graph.nodes.get(id);
  }

  /** Get all nodes */
  getAllNodes(): CodeNode[] {
    return [...this.graph.nodes.values()];
  }

  /** Get all edges */
  getAllEdges(): CodeEdge[] {
    return [...this.graph.edges];
  }

  /** Get outgoing edges from a node */
  getEdgesFrom(nodeId: string): CodeEdge[] {
    const indices = this.graph.adjacency.get(nodeId);
    if (!indices) return [];
    return indices.flatMap((i) => this.graph.edges[i] ?? []);
  }

  /** Get incoming edges to a node */
  getEdgesTo(nodeId: string): CodeEdge[] {
    const indices = this.graph.reverseAdjacency.get(nodeId);
    if (!indices) return [];
    return indices.flatMap((i) => this.graph.edges[i] ?? []);
  }

  /** Get all nodes that a given node imports/references */
  getDependencies(nodeId: string): CodeNode[] {
    const edges = this.getEdgesFrom(nodeId).filter(
      (e) => e.kind === 'import' || e.kind === 'references',
    );
    return edges
      .map((e) => this.graph.nodes.get(e.to))
      .filter((n): n is CodeNode => n !== undefined);
  }

  /** Get all nodes that depend on a given node */
  getDependents(nodeId: string): CodeNode[] {
    const edges = this.getEdgesTo(nodeId).filter(
      (e) => e.kind === 'import' || e.kind === 'references',
    );
    return edges
      .map((e) => this.graph.nodes.get(e.from))
      .filter((n): n is CodeNode => n !== undefined);
  }

  /** Get child nodes (contained within, e.g. methods of a class) */
  getChildren(nodeId: string): CodeNode[] {
    const edges = this.getEdgesFrom(nodeId).filter((e) => e.kind === 'contains');
    return edges
      .map((e) => this.graph.nodes.get(e.to))
      .filter((n): n is CodeNode => n !== undefined);
  }

  /** Get nodes of a specific kind */
  getNodesByKind(kind: CodeNode['kind']): CodeNode[] {
    return this.getAllNodes().filter((n) => n.kind === kind);
  }

  /** Get statistics */
  stats(): { nodes: number; edges: number; files: number } {
    const files = new Set<string>();
    for (const node of this.graph.nodes.values()) {
      files.add(node.filePath);
    }
    return {
      nodes: this.graph.nodes.size,
      edges: this.graph.edges.length,
      files: files.size,
    };
  }

  // ---------------------------------------------------------------------------
  // Traversal
  // ---------------------------------------------------------------------------

  /**
   * BFS traversal from a starting node, following outgoing edges.
   * Returns nodes in BFS order up to maxDepth.
   */
  bfs(startId: string, maxDepth = 3): CodeNode[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
    const result: CodeNode[] = [];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      if (visited.has(item.id)) continue;
      visited.add(item.id);

      const node = this.graph.nodes.get(item.id);
      if (node) result.push(node);

      if (item.depth < maxDepth) {
        const edges = this.getEdgesFrom(item.id);
        for (const edge of edges) {
          if (!visited.has(edge.to)) {
            queue.push({ id: edge.to, depth: item.depth + 1 });
          }
        }
      }
    }

    return result;
  }

  /**
   * DFS traversal from a starting node, following outgoing edges.
   */
  dfs(startId: string, maxDepth = 3): CodeNode[] {
    const visited = new Set<string>();
    const result: CodeNode[] = [];

    const visit = (id: string, depth: number): void => {
      if (visited.has(id) || depth > maxDepth) return;
      visited.add(id);

      const node = this.graph.nodes.get(id);
      if (node) result.push(node);

      const edges = this.getEdgesFrom(id);
      for (const edge of edges) {
        visit(edge.to, depth + 1);
      }
    };

    visit(startId, 0);
    return result;
  }

  /**
   * Find the shortest path between two nodes (BFS).
   * Returns node ids in path order, or null if no path exists.
   */
  findPath(fromId: string, toId: string, maxDepth = 10): string[] | null {
    const visited = new Set<string>();
    const parent = new Map<string, string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: fromId, depth: 0 }];
    visited.add(fromId);

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      if (item.id === toId) {
        // Reconstruct path
        const path: string[] = [toId];
        let current = toId;
        while (parent.has(current)) {
          const next = parent.get(current);
          if (!next) break;
          current = next;
          path.unshift(current);
        }
        return path;
      }

      if (item.depth >= maxDepth) continue;

      const edges = this.getEdgesFrom(item.id);
      for (const edge of edges) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          parent.set(edge.to, item.id);
          queue.push({ id: edge.to, depth: item.depth + 1 });
        }
      }
    }

    return null;
  }

  /**
   * Detect cycles in the graph (simple DFS-based).
   * Returns arrays of node ids forming cycles.
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const stack: string[] = [];

    const dfs = (id: string): void => {
      if (inStack.has(id)) {
        // Found a cycle
        const cycleStart = stack.indexOf(id);
        if (cycleStart >= 0) {
          cycles.push(stack.slice(cycleStart));
        }
        return;
      }
      if (visited.has(id)) return;

      visited.add(id);
      inStack.add(id);
      stack.push(id);

      const edges = this.getEdgesFrom(id);
      for (const edge of edges) {
        dfs(edge.to);
      }

      stack.pop();
      inStack.delete(id);
    };

    for (const id of this.graph.nodes.keys()) {
      dfs(id);
    }

    return cycles;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /** Export the graph as JSON-serializable object */
  toJSON(): { nodes: CodeNode[]; edges: CodeEdge[] } {
    return {
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
    };
  }

  /** Import from serialized data */
  static fromJSON(data: { nodes: CodeNode[]; edges: CodeEdge[] }): KnowledgeGraph {
    const graph = new KnowledgeGraph();
    graph.addNodes(data.nodes);
    graph.addEdges(data.edges);
    return graph;
  }

  /** Clear the entire graph */
  clear(): void {
    this.graph.nodes.clear();
    this.graph.edges = [];
    this.graph.adjacency.clear();
    this.graph.reverseAdjacency.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private findModuleNode(filePath: string): string | undefined {
    for (const [id, node] of this.graph.nodes) {
      if (node.kind === 'module' && node.filePath === filePath) {
        return id;
      }
    }
    return undefined;
  }

  private findNodeByName(name: string): CodeNode | undefined {
    const lower = name.toLowerCase();
    for (const node of this.graph.nodes.values()) {
      if (node.name.toLowerCase() === lower) return node;
    }
    return undefined;
  }

  private resolveImportTarget(moduleSpecifier: string, _sourceFile: string): string | undefined {
    // Try direct match by module name
    for (const [id, node] of this.graph.nodes) {
      if (node.kind === 'module') {
        // Match by file basename or relative path
        const baseName = node.name.toLowerCase();
        const specLower = moduleSpecifier.toLowerCase().replace(/\.js$/, '').replace(/\.ts$/, '');
        if (specLower.endsWith(baseName) || specLower === baseName) {
          return id;
        }
      }
    }
    return undefined;
  }

  private rebuildAdjacency(): void {
    this.graph.adjacency.clear();
    this.graph.reverseAdjacency.clear();

    for (let i = 0; i < this.graph.edges.length; i++) {
      const edge = this.graph.edges[i];
      if (!edge) continue;

      let adj = this.graph.adjacency.get(edge.from);
      if (!adj) {
        adj = [];
        this.graph.adjacency.set(edge.from, adj);
      }
      adj.push(i);

      let rev = this.graph.reverseAdjacency.get(edge.to);
      if (!rev) {
        rev = [];
        this.graph.reverseAdjacency.set(edge.to, rev);
      }
      rev.push(i);
    }
  }
}
