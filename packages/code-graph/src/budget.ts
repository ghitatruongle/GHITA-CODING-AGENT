import type { CodeEdge, CodeNode } from './types.js';

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
