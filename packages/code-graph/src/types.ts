// Core type definitions for graph nodes, edges, symbols, and search results.

// Node types — represent code entities extracted from AST

export type CodeNodeKind =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'module'
  | 'property'
  | 'parameter';

export interface CodeNode {
  /** Unique identifier: `${filePath}::${qualifiedName}` */
  id: string;
  /** Kind of code entity */
  kind: CodeNodeKind;
  /** Simple name (e.g. 'handleClick') */
  name: string;
  /** Fully qualified name (e.g. 'MyClass.handleClick') */
  qualifiedName: string;
  /** Absolute file path */
  filePath: string;
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based) */
  endLine: number;
  /** Source code excerpt (first ~200 chars) */
  excerpt: string;
  /** Exported from module? */
  exported: boolean;
  /** JSDoc/TSDoc summary if available */
  docComment?: string;
  /** Parameter names (for functions/methods) */
  parameters?: string[];
  /** Return type text (for functions/methods) */
  returnType?: string;
  /** Parent node id (e.g. class containing a method) */
  parentId?: string;
  /** Tags for search indexing (lowercase) */
  tags: string[];
  /** Timestamp when this node was last indexed */
  indexedAt: number;
}

// Edge types — represent relationships between nodes

export type CodeEdgeKind =
  | 'import'
  | 'call'
  | 'extends'
  | 'implements'
  | 'references'
  | 'contains'
  | 'exports';

export interface CodeEdge {
  /** Source node id */
  from: string;
  /** Target node id */
  to: string;
  /** Relationship type */
  kind: CodeEdgeKind;
  /** Weight / importance score (0.0 – 1.0) */
  weight: number;
  /** Line number where this edge was detected */
  line?: number;
}

// Dependency Graph

export interface DependencyGraph {
  /** All nodes indexed by id */
  nodes: Map<string, CodeNode>;
  /** All edges */
  edges: CodeEdge[];
  /** Adjacency list: nodeId → outgoing edge indices */
  adjacency: Map<string, number[]>;
  /** Reverse adjacency: nodeId → incoming edge indices */
  reverseAdjacency: Map<string, number[]>;
}

export interface ImportInfo {
  /** The module specifier (e.g. './utils.js', '@ghita/shared') */
  moduleSpecifier: string;
  /** Named imports (e.g. ['sleep', 'AIStreamChunk']) */
  namedImports: string[];
  /** Default import name */
  defaultImport?: string;
  /** Namespace import (e.g. `import * as fs`) */
  namespaceImport?: string;
  /** Is this a type-only import? */
  isTypeOnly: boolean;
  /** Source file containing this import */
  sourceFile: string;
  /** Line number */
  line: number;
}

// Search types

export type SearchScope = 'all' | 'function' | 'class' | 'interface' | 'module' | 'type' | 'enum';

export interface SearchQuery {
  /** Text pattern to match (case-insensitive substring by default) */
  pattern: string;
  /** Narrow results to a specific kind */
  scope?: SearchScope;
  /** Limit results (default: 50) */
  limit?: number;
  /** Filter to a specific file or directory prefix */
  filePrefix?: string;
  /** Include excerpts in results? (default: true) */
  includeExcerpt?: boolean;
  /** Minimum relevance score (0.0 – 1.0) */
  minScore?: number;
}

export interface SearchResult {
  node: CodeNode;
  /** Relevance score (0.0 – 1.0) */
  score: number;
  /** Highlighted match positions [start, end] */
  highlights: Array<[number, number]>;
}

// Store adapter interface

export interface GraphStore {
  /** Save or update a batch of nodes */
  upsertNodes(nodes: CodeNode[]): void;
  /** Save or update a batch of edges */
  upsertEdges(edges: CodeEdge[]): void;
  /** Remove all nodes and edges for a given file */
  removeFile(filePath: string): void;
  /** Load all nodes */
  loadNodes(): CodeNode[];
  /** Load all edges */
  loadEdges(): CodeEdge[];
  /** Search nodes by pattern */
  search(query: SearchQuery): SearchResult[];
  /** Get a node by id */
  getNode(id: string): CodeNode | null;
  /** Get edges from a node */
  getEdgesFrom(nodeId: string): CodeEdge[];
  /** Get edges to a node */
  getEdgesTo(nodeId: string): CodeEdge[];
  /** Get total counts */
  stats(): { nodes: number; edges: number; files: number };
  /** Close the store */
  close(): void;
}

// Parse options

export interface ParseOptions {
  /** File extensions to include (default: ['.ts', '.tsx', '.js', '.jsx']) */
  extensions?: string[];
  /** Glob patterns to exclude (default: ['node_modules', 'dist', '*.test.*']) */
  exclude?: string[];
  /** Maximum file size in bytes to parse (default: 500KB) */
  maxFileSize?: number;
  /** Whether to extract JSDoc comments (default: true) */
  extractDocs?: boolean;
  /**
   * v1.1.1: force the TS Compiler API walk even when the native tree-sitter
   * addon is available (test parity / debug).
   */
  forceJs?: boolean;
}

/**
 * Impact report (blast-radius analysis) when changing a symbol.
 */
export interface ImpactReport {
  /** Target node or identifier analyzed */
  target: CodeNode | { id: string; name: string; filePath?: string };
  /** Maximum traversal depth evaluated */
  depth: number;
  /** All nodes that depend on or call the target (transitively) */
  impactedNodes: CodeNode[];
  /** Distinct file paths affected by changes to the target */
  impactedFiles: string[];
  /** Calculated risk score (0.0 – 1.0) based on blast radius & centrality */
  riskScore: number;
  /** Sample dependency paths from upstream dependents to target */
  paths: string[][];
}

/**
 * Neighborhood exploration result around a symbol or file.
 */
export interface ExploreResult {
  /** The focal point of the exploration */
  center: CodeNode | { filePath: string; name: string };
  /** Subgraph nodes in the neighborhood */
  nodes: CodeNode[];
  /** Subgraph edges in the neighborhood */
  edges: CodeEdge[];
  /** Number of incoming connections */
  inwardCount: number;
  /** Number of outgoing connections */
  outwardCount: number;
}

/**
 * Comprehensive status of the code graph.
 */
export interface GraphStatus {
  /** Total number of indexed nodes */
  nodesCount: number;
  /** Total number of indexed edges */
  edgesCount: number;
  /** Total number of indexed files */
  filesCount: number;
  /** Breakdown of nodes by kind */
  nodesByKind: Record<string, number>;
  /** Breakdown of edges by kind */
  edgesByKind: Record<string, number>;
  /** Is SQLite persistence store active? */
  storeActive: boolean;
  /** Optional cache stats */
  cacheStats?: {
    hits: number;
    misses: number;
    cachedFiles: number;
  };
}

/**
 * Content-addressed index entry caching AST parse results by SHA-256 hash.
 */
export interface ContentCacheEntry {
  contentHash: string;
  filePath: string;
  nodes: CodeNode[];
  edges: CodeEdge[];
  imports: ImportInfo[];
  createdAt: number;
}

/**
 * Branch/checkpoint tag metadata for content-addressed catalog.
 */
export interface BranchTagInfo {
  filePath: string;
  tags: string[];
}
