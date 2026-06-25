// ==============================================================================
// GHITA CODING AGENT - Phase 13: Code Knowledge Graph — Package Entry
// ==============================================================================

// --- Types ---
export type {
  CodeNode,
  CodeNodeKind,
  CodeEdge,
  CodeEdgeKind,
  DependencyGraph,
  ImportInfo,
  SearchQuery,
  SearchResult,
  SearchScope,
  GraphStore,
  ParseOptions,
} from './types.js';

// --- AST Parser ---
export { parseFile, parseFiles, discoverFiles } from './ast-parser.js';
export type { ParseResult } from './ast-parser.js';

// --- Knowledge Graph ---
export { KnowledgeGraph } from './knowledge-graph.js';

// --- Search Engine ---
export { SearchEngine } from './search.js';

// --- SQLite Store ---
export { SQLiteGraphStore } from './store.js';

// --- Main orchestrator ---
import path from 'node:path';
import { parseFile, parseFiles, discoverFiles } from './ast-parser.js';
import { KnowledgeGraph } from './knowledge-graph.js';
import { SearchEngine } from './search.js';
import { SQLiteGraphStore } from './store.js';
import type { CodeNode, SearchQuery, SearchResult, ParseOptions, GraphStore } from './types.js';

/**
 * Main entry point for the Code Knowledge Graph system.
 *
 * Combines AST parsing, in-memory graph, search engine, and optional
 * SQLite persistence into a single unified API.
 *
 * @example
 * ```ts
 * const kg = new CodeKnowledgeGraph();
 * await kg.indexDirectory('./packages/ai-engine/src');
 * const results = kg.search({ pattern: 'chatStream', scope: 'function' });
 * ```
 */
export class CodeKnowledgeGraph {
  private graph: KnowledgeGraph;
  private searchEngine: SearchEngine;
  private store: GraphStore | null = null;
  private indexedFiles = new Set<string>();

  constructor() {
    this.graph = new KnowledgeGraph();
    this.searchEngine = new SearchEngine();
  }

  /**
   * Enable SQLite persistence for the graph.
   */
  enablePersistence(dbPath: string): void {
    this.store = new SQLiteGraphStore(dbPath);

    // Load existing data from store
    const existingNodes = this.store.loadNodes();
    const existingEdges = this.store.loadEdges();

    if (existingNodes.length > 0) {
      this.graph.addNodes(existingNodes);
      this.graph.addEdges(existingEdges);
      this.searchEngine.buildIndex(this.graph.getAllNodes());

      for (const node of existingNodes) {
        if (node.kind === 'module') {
          this.indexedFiles.add(node.filePath);
        }
      }
    }
  }

  /**
   * Index all source files in a directory.
   */
  indexDirectory(
    dir: string,
    options?: ParseOptions,
  ): {
    files: number;
    nodes: number;
    edges: number;
  } {
    const absoluteDir = path.resolve(dir);
    const files = discoverFiles(absoluteDir, options);

    // Remove old data for files that no longer exist
    for (const oldFile of this.indexedFiles) {
      if (!files.includes(oldFile)) {
        this.graph.removeFile(oldFile);
        if (this.store) this.store.removeFile(oldFile);
        this.indexedFiles.delete(oldFile);
      }
    }

    // Parse all files
    const result = parseFiles(files, options);

    // Add to graph
    this.graph.addNodes(result.nodes);
    this.graph.addEdges(result.edges);
    this.graph.buildImportEdges(result.imports);

    // Track indexed files
    for (const file of files) {
      this.indexedFiles.add(path.resolve(file));
    }

    // Rebuild search index
    this.searchEngine.buildIndex(this.graph.getAllNodes());

    // Persist to store
    if (this.store) {
      this.store.upsertNodes(result.nodes);
      this.store.upsertEdges(this.graph.getAllEdges());
    }

    return {
      files: files.length,
      nodes: result.nodes.length,
      edges: this.graph.getAllEdges().length,
    };
  }

  /**
   * Index a single file.
   */
  indexFile(filePath: string, options?: ParseOptions): void {
    const absolutePath = path.resolve(filePath);

    // Remove old data for this file
    this.graph.removeFile(absolutePath);
    if (this.store) this.store.removeFile(absolutePath);

    // Parse
    const result = parseFile(absolutePath, options);

    // Add to graph
    this.graph.addNodes(result.nodes);
    this.graph.addEdges(result.edges);
    this.graph.buildImportEdges(result.imports);

    this.indexedFiles.add(absolutePath);

    // Rebuild search index
    this.searchEngine.buildIndex(this.graph.getAllNodes());

    // Persist
    if (this.store) {
      this.store.upsertNodes(result.nodes);
      this.store.upsertEdges(this.graph.getAllEdges());
    }
  }

  /**
   * Search the knowledge graph.
   */
  search(query: SearchQuery): SearchResult[] {
    // Try store-backed search if available (uses FTS5)
    if (this.store && query.pattern.length > 1) {
      return this.store.search(query);
    }
    return this.searchEngine.search(query);
  }

  /**
   * Get a node by id.
   */
  getNode(id: string): CodeNode | undefined {
    return this.graph.getNode(id);
  }

  /**
   * Get all dependencies of a node (imports, references).
   */
  getDependencies(nodeId: string): CodeNode[] {
    return this.graph.getDependencies(nodeId);
  }

  /**
   * Get all dependents of a node (what imports/references this).
   */
  getDependents(nodeId: string): CodeNode[] {
    return this.graph.getDependents(nodeId);
  }

  /**
   * Get child nodes (methods of a class, etc.).
   */
  getChildren(nodeId: string): CodeNode[] {
    return this.graph.getChildren(nodeId);
  }

  /**
   * BFS traversal from a node.
   */
  bfs(startId: string, maxDepth?: number): CodeNode[] {
    return this.graph.bfs(startId, maxDepth);
  }

  /**
   * DFS traversal from a node.
   */
  dfs(startId: string, maxDepth?: number): CodeNode[] {
    return this.graph.dfs(startId, maxDepth);
  }

  /**
   * Find shortest path between two nodes.
   */
  findPath(fromId: string, toId: string): string[] | null {
    return this.graph.findPath(fromId, toId);
  }

  /**
   * Detect circular dependencies.
   */
  detectCycles(): string[][] {
    return this.graph.detectCycles();
  }

  /**
   * Get nodes of a specific kind.
   */
  getNodesByKind(kind: CodeNode['kind']): CodeNode[] {
    return this.graph.getNodesByKind(kind);
  }

  /**
   * Get all indexed nodes.
   */
  getAllNodes(): CodeNode[] {
    return this.graph.getAllNodes();
  }

  /**
   * Get all edges.
   */
  getAllEdges() {
    return this.graph.getAllEdges();
  }

  /**
   * Get graph statistics.
   */
  stats(): { nodes: number; edges: number; files: number } {
    if (this.store) return this.store.stats();
    return this.graph.stats();
  }

  /**
   * Access the underlying graph structure.
   */
  getGraph(): KnowledgeGraph {
    return this.graph;
  }

  /**
   * Clear all data.
   */
  clear(): void {
    this.graph.clear();
    this.searchEngine.buildIndex([]);
    this.indexedFiles.clear();
  }

  /**
   * Close and release resources.
   */
  close(): void {
    if (this.store) {
      this.store.close();
      this.store = null;
    }
  }
}
