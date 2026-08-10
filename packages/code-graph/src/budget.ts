// ==============================================================================
// GHITA CODING AGENT - Code-graph index budget (v1.1.0 Track 9 B4)
// ==============================================================================
// Byte-budget tracker for the in-memory index: ước lượng bytes theo
// node/edge counts, cảnh báo tại cap 200MB và gợi ý spill SQLite
// (SQLiteGraphStore đã có trong code-graph).
// ==============================================================================

import type { CodeEdge, CodeNode } from './types.js';

/** Ước lượng bytes lưu trữ một node (id + name + qualifiedName + filePath + excerpt). */
export function estimateNodeBytes(node: CodeNode): number {
  return (
    node.id.length +
    node.name.length +
    node.qualifiedName.length +
    node.filePath.length +
    (node.excerpt?.length ?? 0) +
    96 // overhead object
  );
}

export function estimateEdgeBytes(edge: CodeEdge): number {
  return edge.from.length + edge.to.length + 24;
}

export interface IndexBudgetOptions {
  /** Cap bytes (mặc định 200 MB). */
  maxBytes?: number;
  onExceed?: (state: IndexBudgetState) => void;
}

export interface IndexBudgetState {
  nodes: number;
  edges: number;
  bytes: number;
  maxBytes: number;
  ratio: number;
  over: boolean;
  /** Gợi ý spill khi vượt cap. */
  spillSuggestion: boolean;
}

export class IndexBudgetTracker {
  private bytes = 0;
  private nodes = 0;
  private edges = 0;
  private readonly maxBytes: number;
  private readonly onExceed?: (state: IndexBudgetState) => void;

  constructor(options: IndexBudgetOptions = {}) {
    this.maxBytes = options.maxBytes ?? 200 * 1024 * 1024;
    this.onExceed = options.onExceed;
  }

  /** Add a batch of nodes/edges; returns false khi vượt cap (deny-default). */
  addBatch(nodes: readonly CodeNode[], edges: readonly CodeEdge[]): boolean {
    let added = 0;
    for (const n of nodes) added += estimateNodeBytes(n);
    for (const e of edges) added += estimateEdgeBytes(e);
    this.nodes += nodes.length;
    this.edges += edges.length;
    this.bytes += added;
    const state = this.state();
    if (state.over) {
      this.onExceed?.(state);
      return false;
    }
    return true;
  }

  /** Evict n nodes (LRU-ish: theo thứ tự thêm) → giảm bytes. */
  evict(
    count: number,
    drop: (nodeIds: string[]) => void,
    nodes: readonly CodeNode[],
  ): IndexBudgetState {
    const removed = nodes.slice(0, count);
    drop(removed.map((n) => n.id));
    this.nodes = Math.max(0, this.nodes - removed.length);
    this.bytes = Math.max(0, this.bytes - removed.reduce((s, n) => s + estimateNodeBytes(n), 0));
    return this.state();
  }

  state(): IndexBudgetState {
    const ratio = this.maxBytes === 0 ? 0 : this.bytes / this.maxBytes;
    return {
      nodes: this.nodes,
      edges: this.edges,
      bytes: this.bytes,
      maxBytes: this.maxBytes,
      ratio,
      over: this.bytes > this.maxBytes,
      spillSuggestion: this.bytes > this.maxBytes,
    };
  }
}
