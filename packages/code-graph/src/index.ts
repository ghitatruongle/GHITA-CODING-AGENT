// ==============================================================================
// GHITA CODING AGENT - Phase 13 / Track 3 (v1.1.5-beta1): Code Knowledge Graph
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
  ImpactReport,
  ExploreResult,
  GraphStatus,
  ContentCacheEntry,
  BranchTagInfo,
} from './types.js';

// --- AST Parser ---
export { parseFile, parseSource, parseFiles, discoverFiles } from './ast-parser.js';
export type { ParseResult } from './ast-parser.js';

// --- Knowledge Graph ---
export { KnowledgeGraph } from './knowledge-graph.js';

// --- Search Engine ---
export { SearchEngine } from './search.js';

// --- SQLite Store ---
export { SQLiteGraphStore } from './store.js';

// --- MCP Server (standard @ghita/mcp) ---
export { CodeGraphMCPServer } from './mcp-server.js';
export { IndexBudgetTracker, estimateNodeBytes, estimateEdgeBytes } from './budget.js';
export type { IndexBudgetOptions, IndexBudgetState } from './budget.js';

// --- Track 3.2: Content-Addressed Index & PauseToken ---
export { PauseToken } from './pause-token.js';
export {
  ContentAddressedIndex,
  type ContentIndexOptions,
  type ContentIndexStats,
} from './content-index.js';

// --- Track 3.3: Auto-Sync Watcher ---
export {
  CodeGraphWatcher,
  type WatcherOptions,
  type WatcherStats,
  type WatcherEvent,
} from './watcher.js';

// --- Track 3.4: Repo-Map Ranking & Session Injection ---
export {
  computePageRank,
  getRepoMap,
  renderRepoMap,
  renderTreeRepoMap,
  RepoMapSessionService,
  injectRepoMapContext,
  estimateTokens,
  type RepoMap,
  type RepoMapEntry,
  type PageRankOptions,
  type TreeRepoMapOptions,
  type RepoMapSessionResult,
} from './repo-map.js';

// --- Track 3.5: Multi-Server LSP Client & Diagnostics Ledger ---
export {
  LspDiagnosticSeverity,
  type LspDiagnostic,
  type LspPosition,
  type LspRange,
  type DiagnosticsDiff,
  type LspServerConfig,
  type LspLocation,
  type LspHoverResult,
  type LspTextEdit,
} from './lsp-types.js';
export { DiagnosticsLedger, DeferredDiagnosticsManager } from './diagnostics-ledger.js';
export { LspClient, LspManager, type LspClientOptions } from './lsp-client.js';

// --- Main orchestrator ---
import path from 'node:path';
import { parseFile, parseFiles, discoverFiles } from './ast-parser.js';
import { KnowledgeGraph } from './knowledge-graph.js';
import { SearchEngine } from './search.js';
import { SQLiteGraphStore } from './store.js';
import { ContentAddressedIndex } from './content-index.js';
import { CodeGraphWatcher, type WatcherOptions } from './watcher.js';
import {
  RepoMapSessionService,
  renderTreeRepoMap,
  type TreeRepoMapOptions,
  type RepoMapSessionResult,
  type RepoMap,
  type PageRankOptions,
} from './repo-map.js';
import { LspManager } from './lsp-client.js';
import type { CodeNode, SearchQuery, SearchResult, ParseOptions } from './types.js';
import { getRepoMap as buildRepoMap } from './repo-map.js';

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
  private store: SQLiteGraphStore | null = null;
  private indexedFiles = new Set<string>();
  private contentIndex: ContentAddressedIndex;
  private repoMapSession: RepoMapSessionService;
  private lspManager: LspManager | null = null;

  constructor() {
    this.graph = new KnowledgeGraph();
    this.searchEngine = new SearchEngine();
    this.contentIndex = new ContentAddressedIndex();
    this.repoMapSession = new RepoMapSessionService();
  }

  /**
   * Enable SQLite persistence for the graph.
   */
  enablePersistence(dbPath: string): void {
    const sqliteStore = new SQLiteGraphStore(dbPath);
    this.store = sqliteStore;
    this.contentIndex.setStore(sqliteStore);

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
   * Remove all graph/store/search data for a file (e.g. after unlink).
   * Unlike indexFile(), this never touches the filesystem, so it is safe
   * for files that no longer exist.
   */
  unindexFile(filePath: string): void {
    const absolutePath = path.resolve(filePath);
    this.graph.removeFile(absolutePath);
    if (this.store) this.store.removeFile(absolutePath);
    this.indexedFiles.delete(absolutePath);
    this.searchEngine.buildIndex(this.graph.getAllNodes());
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
   * v0.4.9 A8: Build a repo map — the most important symbols
   * (ranked by PageRank over the reference graph) that fit `budgetTokens`.
   */
  getRepoMap(budgetTokens = 4000, options?: PageRankOptions): RepoMap {
    return buildRepoMap(this.graph.getAllNodes(), this.graph.getAllEdges(), budgetTokens, options);
  }

  /**
   * Track 3 (3.1): Get callers of a function/method/symbol.
   */
  getCallers(symbolIdOrName: string): CodeNode[] {
    return this.graph.getCallers(symbolIdOrName);
  }

  /**
   * Track 3 (3.1): Get callees of a function/method/symbol.
   */
  getCallees(symbolIdOrName: string): CodeNode[] {
    return this.graph.getCallees(symbolIdOrName);
  }

  /**
   * Track 3 (3.1): Calculate blast radius (impact report) when a symbol changes.
   */
  getImpact(symbolIdOrName: string, maxDepth = 3) {
    return this.graph.getImpact(symbolIdOrName, maxDepth);
  }

  /**
   * Track 3 (3.1): Explore neighborhood subgraph around a symbol or file.
   */
  explore(startSymbolOrFile: string, options?: { depth?: number; kinds?: CodeNode['kind'][] }) {
    return this.graph.explore(startSymbolOrFile, options);
  }

  /**
   * Track 3 (3.2): Access content-addressed indexing service.
   */
  getContentIndex(): ContentAddressedIndex {
    return this.contentIndex;
  }

  /**
   * Track 3 (3.3): Create a live auto-sync watcher.
   */
  createWatcher(options?: WatcherOptions): CodeGraphWatcher {
    return new CodeGraphWatcher(this, options);
  }

  /**
   * Track 3 (3.4): Build tree-structured repo map.
   */
  getRepoMapTree(budgetTokens = 2000, options?: PageRankOptions & TreeRepoMapOptions): string {
    const map = this.getRepoMap(budgetTokens, options);
    return renderTreeRepoMap(map, options);
  }

  /**
   * Track 3 (3.4): Generate session repo map with caching.
   */
  getSessionRepoMap(
    budgetTokens = 2000,
    options?: PageRankOptions & TreeRepoMapOptions,
  ): RepoMapSessionResult {
    return this.repoMapSession.generateSessionRepoMap(
      this.graph.getAllNodes(),
      this.graph.getAllEdges(),
      budgetTokens,
      options,
    );
  }

  /**
   * Track 3 (3.5): Get or lazily initialize the multi-server LSP manager.
   */
  getLspManager(): LspManager {
    if (!this.lspManager) {
      this.lspManager = new LspManager();
    }
    return this.lspManager;
  }

  /**
   * Track 3 (3.1): Detailed graph status.
   */
  statusDetailed() {
    const s = this.graph.status();
    s.storeActive = this.store !== null;
    s.cacheStats = {
      hits: this.contentIndex.getStats().hits,
      misses: this.contentIndex.getStats().misses,
      cachedFiles: this.contentIndex.getStats().cachedEntries,
    };
    return s;
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
    this.contentIndex.clear();
    this.repoMapSession.invalidate();
  }

  /**
   * Close and release resources.
   */
  close(): void {
    if (this.store) {
      this.store.close();
      this.store = null;
    }
    if (this.lspManager) {
      void this.lspManager.stopAll();
      this.lspManager = null;
    }
  }
}
