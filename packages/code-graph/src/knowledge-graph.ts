// In-memory graph structure with adjacency lists, traversal, and cycle detection.

import type {
  CodeNode,
  CodeEdge,
  DependencyGraph,
  ImportInfo,
  ImpactReport,
  ExploreResult,
  GraphStatus,
} from './types.js';

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

  // Mutation
  
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

  // Queries
  
  /** Get a node by id */
  getNode(id: string): CodeNode | undefined {
    return this.graph.nodes.get(id);
  }

  /** Find a node by ID, qualifiedName, or simple name */
  findNode(idOrName: string): CodeNode | undefined {
    if (this.graph.nodes.has(idOrName)) {
      return this.graph.nodes.get(idOrName);
    }
    const lower = idOrName.toLowerCase();
    for (const node of this.graph.nodes.values()) {
      if (node.qualifiedName.toLowerCase() === lower || node.name.toLowerCase() === lower) {
        return node;
      }
    }
    return undefined;
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
      (e) => e.kind === 'import' || e.kind === 'references' || e.kind === 'call',
    );
    return edges
      .map((e) => this.graph.nodes.get(e.to))
      .filter((n): n is CodeNode => n !== undefined);
  }

  /** Get all nodes that depend on a given node */
  getDependents(nodeId: string): CodeNode[] {
    const edges = this.getEdgesTo(nodeId).filter(
      (e) => e.kind === 'import' || e.kind === 'references' || e.kind === 'call',
    );
    return edges
      .map((e) => this.graph.nodes.get(e.from))
      .filter((n): n is CodeNode => n !== undefined);
  }

  /**

   * Traverses incoming edges with kind 'call' or 'references'.
   */
  getCallers(symbolIdOrName: string): CodeNode[] {
    const target = this.findNode(symbolIdOrName);
    if (!target) return [];

    const incoming = this.getEdgesTo(target.id).filter(
      (e) => e.kind === 'call' || e.kind === 'references',
    );

    const callerIds = new Set<string>();
    const callers: CodeNode[] = [];
    for (const edge of incoming) {
      if (!callerIds.has(edge.from)) {
        callerIds.add(edge.from);
        const node = this.graph.nodes.get(edge.from);
        if (node) callers.push(node);
      }
    }
    return callers;
  }

  /**

   * Traverses outgoing edges with kind 'call' or 'references'.
   */
  getCallees(symbolIdOrName: string): CodeNode[] {
    const target = this.findNode(symbolIdOrName);
    if (!target) return [];

    const outgoing = this.getEdgesFrom(target.id).filter(
      (e) => e.kind === 'call' || e.kind === 'references',
    );

    const calleeIds = new Set<string>();
    const callees: CodeNode[] = [];
    for (const edge of outgoing) {
      if (!calleeIds.has(edge.to)) {
        calleeIds.add(edge.to);
        const node = this.graph.nodes.get(edge.to);
        if (node) callees.push(node);
      }
    }
    return callees;
  }

  /**

   * Traverses upstream reverse-dependencies up to maxDepth.
   */
  getImpact(symbolIdOrName: string, maxDepth = 3): ImpactReport {
    const target = this.findNode(symbolIdOrName);
    const targetInfo = target ?? { id: symbolIdOrName, name: symbolIdOrName };

    if (!target) {
      return {
        target: targetInfo,
        depth: maxDepth,
        impactedNodes: [],
        impactedFiles: [],
        riskScore: 0,
        paths: [],
      };
    }

    const visited = new Set<string>([target.id]);
    const impactedNodes: CodeNode[] = [];
    const impactedFilesSet = new Set<string>();
    const queue: Array<{ id: string; depth: number; path: string[] }> = [
      { id: target.id, depth: 0, path: [target.name || target.id] },
    ];
    const samplePaths: string[][] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      if (current.depth >= maxDepth) continue;

      // Follow incoming edges (who depends on / calls current)
      const incomingEdges = this.getEdgesTo(current.id);
      for (const edge of incomingEdges) {
        if (edge.kind === 'contains') continue; // Skip parent-contains edges for reverse callers

        const callerNode = this.graph.nodes.get(edge.from);
        if (!callerNode) continue;

        const nextPath = [callerNode.name || callerNode.id, ...current.path];

        if (!visited.has(callerNode.id)) {
          visited.add(callerNode.id);
          impactedNodes.push(callerNode);
          if (callerNode.filePath && callerNode.filePath !== target.filePath) {
            impactedFilesSet.add(callerNode.filePath);
          }
          if (samplePaths.length < 10) {
            samplePaths.push(nextPath);
          }
          queue.push({
            id: callerNode.id,
            depth: current.depth + 1,
            path: nextPath,
          });
        }
      }
    }

    const totalNodes = Math.max(1, this.graph.nodes.size);
    const totalFiles = Math.max(1, this.stats().files);
    const nodeRatio = impactedNodes.length / totalNodes;
    const fileRatio = impactedFilesSet.size / totalFiles;
    // Risk score combines impacted node and file fractions, clamped 0.0 – 1.0
    const rawScore = Math.min(
      1.0,
      nodeRatio * 0.4 + fileRatio * 0.6 + (impactedNodes.length > 0 ? 0.1 : 0),
    );
    const riskScore = Math.round(rawScore * 100) / 100;

    return {
      target,
      depth: maxDepth,
      impactedNodes,
      impactedFiles: [...impactedFilesSet],
      riskScore,
      paths: samplePaths,
    };
  }

  explore(
    startSymbolOrFile: string,
    options: { depth?: number; kinds?: CodeNode['kind'][] } = {},
  ): ExploreResult {
    const depth = options.depth ?? 1;
    const kindsFilter = options.kinds ? new Set(options.kinds) : null;

    const targetNode = this.findNode(startSymbolOrFile);
    let center: ExploreResult['center'];

    const subNodes = new Map<string, CodeNode>();
    const subEdges: CodeEdge[] = [];
    const visitedEdges = new Set<string>();

    if (targetNode) {
      center = targetNode;
      subNodes.set(targetNode.id, targetNode);
    } else {
      // Check if it's a file path
      const fileNodes = this.getAllNodes().filter((n) => n.filePath.includes(startSymbolOrFile));
      center = { filePath: startSymbolOrFile, name: startSymbolOrFile };
      for (const n of fileNodes) {
        subNodes.set(n.id, n);
      }
    }

    // Traverse neighborhood
    const nodeQueue: Array<{ id: string; d: number }> = [...subNodes.keys()].map((id) => ({
      id,
      d: 0,
    }));
    const visitedNodes = new Set<string>(subNodes.keys());

    while (nodeQueue.length > 0) {
      const item = nodeQueue.shift();
      if (!item) break;
      if (item.d >= depth) continue;

      // Outgoing edges
      for (const edge of this.getEdgesFrom(item.id)) {
        const edgeKey = `${edge.from}->${edge.to}:${edge.kind}`;
        if (!visitedEdges.has(edgeKey)) {
          visitedEdges.add(edgeKey);
          subEdges.push(edge);
        }
        if (!visitedNodes.has(edge.to)) {
          const target = this.graph.nodes.get(edge.to);
          if (target && (!kindsFilter || kindsFilter.has(target.kind))) {
            visitedNodes.add(edge.to);
            subNodes.set(edge.to, target);
            nodeQueue.push({ id: edge.to, d: item.d + 1 });
          }
        }
      }

      // Incoming edges
      for (const edge of this.getEdgesTo(item.id)) {
        const edgeKey = `${edge.from}->${edge.to}:${edge.kind}`;
        if (!visitedEdges.has(edgeKey)) {
          visitedEdges.add(edgeKey);
          subEdges.push(edge);
        }
        if (!visitedNodes.has(edge.from)) {
          const source = this.graph.nodes.get(edge.from);
          if (source && (!kindsFilter || kindsFilter.has(source.kind))) {
            visitedNodes.add(edge.from);
            subNodes.set(edge.from, source);
            nodeQueue.push({ id: edge.from, d: item.d + 1 });
          }
        }
      }
    }

    let inwardCount = 0;
    let outwardCount = 0;
    const centerId = targetNode?.id;
    if (centerId) {
      inwardCount = this.getEdgesTo(centerId).length;
      outwardCount = this.getEdgesFrom(centerId).length;
    }

    return {
      center,
      nodes: [...subNodes.values()],
      edges: subEdges,
      inwardCount,
      outwardCount,
    };
  }

  status(): GraphStatus {
    const nodes = [...this.graph.nodes.values()];
    const edges = this.graph.edges;
    const files = new Set<string>();
    const nodesByKind: Record<string, number> = {};
    const edgesByKind: Record<string, number> = {};

    for (const node of nodes) {
      files.add(node.filePath);
      nodesByKind[node.kind] = (nodesByKind[node.kind] ?? 0) + 1;
    }

    for (const edge of edges) {
      edgesByKind[edge.kind] = (edgesByKind[edge.kind] ?? 0) + 1;
    }

    return {
      nodesCount: nodes.length,
      edgesCount: edges.length,
      filesCount: files.size,
      nodesByKind,
      edgesByKind,
      storeActive: false,
    };
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

  /** Get statistics (summary) */
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

  // Traversal
  
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

  // Serialization
  
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

  // Internal helpers
  
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
