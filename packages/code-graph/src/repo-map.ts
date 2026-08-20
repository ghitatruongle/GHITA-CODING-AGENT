// ==============================================================================
// v0.4.9 A8: Repo-Map Ranking
//
// Ranks code symbols by importance using PageRank over the reference graph,
// then greedily selects the most important symbols that fit a token budget —
// a "repo map" of high-signal context for an LLM.
// ==============================================================================

import path from 'node:path';
import { loadNative } from '@ghita/native-bridge';
import type { CodeEdge, CodeNode } from './types.js';

/** v1.1.0 Track 8 A11: codegraph native addon surface (via @ghita/native-bridge). */
interface CodegraphNative {
  pagerank(
    n: number,
    from: Uint32Array,
    to: Uint32Array,
    weight: Float32Array,
    damping?: number,
    iterations?: number,
  ): Float32Array;
}

/** Bridge cho codegraph addon — load một lần (native-first, JS fallback). */
const codegraphBridge = () =>
  loadNative<CodegraphNative>('codegraph', undefined as unknown as CodegraphNative);

export interface RepoMapEntry {
  id: string;
  name: string;
  qualifiedName: string;
  filePath: string;
  kind: CodeNode['kind'];
  /** PageRank score (higher = more central/important). */
  rank: number;
  startLine: number;
  endLine: number;
  excerpt: string;
}

export interface RepoMap {
  entries: RepoMapEntry[];
  /** Approximate tokens consumed by the included excerpts + headers. */
  usedTokens: number;
  budgetTokens: number;
  /** Total nodes considered before budget truncation. */
  totalSymbols: number;
}

export interface PageRankOptions {
  /** Damping factor (probability of following an edge). Default 0.85. */
  damping?: number;
  /** Power-iteration count. Default 30. */
  iterations?: number;
  /** v1.1.0 Track 8 A11: bỏ qua native addon (test parity / debug). */
  forceJs?: boolean;
}

/** Edge kinds that convey "importance flows to the target". */
const RANKING_EDGE_KINDS = new Set<CodeEdge['kind']>([
  'call',
  'references',
  'import',
  'extends',
  'implements',
]);

/**
 * Compute PageRank over the code graph. Only nodes present in `nodes` are
 * scored; edges to unknown nodes are ignored. Returns a Map id → score that
 * sums to ~1.0 across all nodes.
 */
export function computePageRank(
  nodes: CodeNode[],
  edges: CodeEdge[],
  options: PageRankOptions = {},
): Map<string, number> {
  const damping = options.damping ?? 0.85;
  const iterations = options.iterations ?? 30;
  const n = nodes.length;
  const scores = new Map<string, number>();
  if (n === 0) return scores;

  // ── v1.1.0 Track 8 A11: native pagerank (CSR TypedArray) khi addon có sẵn ──
  if (!options.forceJs) {
    const bridge = codegraphBridge();
    if (bridge.native && typeof bridge.impl.pagerank === 'function') {
      const indexById = new Map<string, number>();
      for (const [i, node] of nodes.entries()) indexById.set(node.id, i);
      const from: number[] = [];
      const to: number[] = [];
      const weight: number[] = [];
      for (const edge of edges) {
        if (!RANKING_EDGE_KINDS.has(edge.kind)) continue;
        const fromIdx = indexById.get(edge.from);
        const toIdx = indexById.get(edge.to);
        if (fromIdx === undefined || toIdx === undefined || fromIdx === toIdx) continue;
        from.push(fromIdx);
        to.push(toIdx);
        weight.push(edge.weight > 0 ? edge.weight : 1);
      }
      const ranks = bridge.impl.pagerank(
        n,
        new Uint32Array(from),
        new Uint32Array(to),
        new Float32Array(weight),
        damping,
        iterations,
      );
      for (const [i, node] of nodes.entries()) scores.set(node.id, ranks[i] ?? 0);
      return scores;
    }
  }

  // ── v1.1.0 Track 8 A5: CSR + TypedArray (Float64Array/Uint32Array) ──────
  // Map id → index để đổi sang không gian số; mọi vòng lặp nóng chạy trên
  // mảng gốc (không object churn), giữ nguyên ngữ nghĩa Map đầu ra.
  const indexById = new Map<string, number>();
  for (const [i, node] of nodes.entries()) indexById.set(node.id, i);

  // Xây danh sách kề trọng số dạng CSR (from/to/weight phẳng).
  const csrFrom: number[] = [];
  const csrTo: number[] = [];
  const csrWeight: number[] = [];
  const outWeight = new Float64Array(n);
  for (const edge of edges) {
    if (!RANKING_EDGE_KINDS.has(edge.kind)) continue;
    const fromIdx = indexById.get(edge.from);
    const toIdx = indexById.get(edge.to);
    if (fromIdx === undefined || toIdx === undefined || fromIdx === toIdx) continue;
    const w = edge.weight > 0 ? edge.weight : 1;
    csrFrom.push(fromIdx);
    csrTo.push(toIdx);
    csrWeight.push(w);
    outWeight[fromIdx] = (outWeight[fromIdx] ?? 0) + w;
  }
  const edgeCount = csrFrom.length;

  const rank = new Float64Array(n).fill(1 / n);
  const next = new Float64Array(n);
  const base = (1 - damping) / n;

  for (let iter = 0; iter < iterations; iter++) {
    next.fill(base);

    // Phân phối khối lượng dangling node đều cho mọi node.
    let danglingMass = 0;
    for (let i = 0; i < n; i++) {
      if (outWeight[i] === 0) danglingMass += rank[i] ?? 0;
    }
    const danglingShare = (damping * danglingMass) / n;

    for (let e = 0; e < edgeCount; e++) {
      const from = csrFrom[e];
      const to = csrTo[e];
      if (from === undefined || to === undefined) continue;
      next[to] =
        (next[to] ?? 0) +
        (damping * (rank[from] ?? 0) * (csrWeight[e] ?? 1)) / (outWeight[from] ?? 1);
    }
    if (danglingShare > 0) {
      for (let i = 0; i < n; i++) next[i] = (next[i] ?? 0) + danglingShare;
    }
    rank.set(next);
  }

  for (const [i, node] of nodes.entries()) scores.set(node.id, rank[i] ?? 0);
  return scores;
}

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build a repo map: rank symbols by PageRank and include the most important
 * ones until the token budget is exhausted. Exported symbols and those with a
 * doc comment are lightly favored on ties.
 */
export function getRepoMap(
  nodes: CodeNode[],
  edges: CodeEdge[],
  budgetTokens: number,
  options: PageRankOptions = {},
): RepoMap {
  const ranks = computePageRank(nodes, edges, options);

  const ranked = [...nodes].sort((a, b) => {
    const ra = ranks.get(a.id) ?? 0;
    const rb = ranks.get(b.id) ?? 0;
    if (rb !== ra) return rb - ra;
    // Tie-breakers: exported first, then documented, then alphabetical.
    if (a.exported !== b.exported) return a.exported ? -1 : 1;
    const da = a.docComment ? 1 : 0;
    const db = b.docComment ? 1 : 0;
    if (da !== db) return db - da;
    return a.qualifiedName.localeCompare(b.qualifiedName);
  });

  const entries: RepoMapEntry[] = [];
  let usedTokens = 0;
  for (const node of ranked) {
    const header = `${node.filePath}:${node.startLine} ${node.kind} ${node.qualifiedName}`;
    const cost = estimateTokens(header) + estimateTokens(node.excerpt);
    if (usedTokens + cost > budgetTokens && entries.length > 0) break;
    entries.push({
      id: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      filePath: node.filePath,
      kind: node.kind,
      rank: ranks.get(node.id) ?? 0,
      startLine: node.startLine,
      endLine: node.endLine,
      excerpt: node.excerpt,
    });
    usedTokens += cost;
    if (usedTokens >= budgetTokens) break;
  }

  return { entries, usedTokens, budgetTokens, totalSymbols: nodes.length };
}

/** Render a repo map as a compact text block for LLM context. */
export function renderRepoMap(map: RepoMap): string {
  const lines = [
    `# Repo map (${map.entries.length}/${map.totalSymbols} symbols, ~${map.usedTokens} tokens)`,
  ];
  for (const e of map.entries) {
    lines.push(`\n## ${e.qualifiedName} — ${e.kind} (${e.filePath}:${e.startLine})`);
    if (e.excerpt) lines.push(e.excerpt);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Track 3 (3.4): Repo-Map Session Injection & Tree Rendering
// ---------------------------------------------------------------------------

export interface TreeRepoMapOptions {
  /** Root directory to compute relative paths from */
  rootDir?: string;
  /** Maximum token budget (default: 2000) */
  maxTokens?: number;
  /** Include one-line excerpt/signature preview? (default: true) */
  includePreview?: boolean;
}

/**
 * Render a hierarchical tree-structured repo map (aider / openclaude style).
 * Groups ranked symbols by file and directory for maximum LLM readability and token efficiency.
 */
export function renderTreeRepoMap(map: RepoMap, options: TreeRepoMapOptions = {}): string {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : undefined;
  const includePreview = options.includePreview ?? true;

  // Group entries by file path
  const filesMap = new Map<string, RepoMapEntry[]>();
  for (const entry of map.entries) {
    let displayPath = entry.filePath;
    if (rootDir && displayPath.startsWith(rootDir)) {
      displayPath = path.relative(rootDir, displayPath).replace(/\\/g, '/');
    } else {
      displayPath = displayPath.replace(/\\/g, '/');
    }
    let list = filesMap.get(displayPath);
    if (!list) {
      list = [];
      filesMap.set(displayPath, list);
    }
    list.push(entry);
  }

  const lines: string[] = [
    `# Repository Map (${map.entries.length}/${map.totalSymbols} symbols, ~${map.usedTokens} tokens)`,
  ];

  for (const [filePath, entries] of filesMap) {
    lines.push(`\n${filePath}:`);
    for (const e of entries) {
      const lineTag = `L${e.startLine}`;
      const kindTag = e.kind;
      let symbolLine = `  ${kindTag} ${e.name} (${lineTag})`;
      if (includePreview && e.excerpt) {
        // First non-empty line of excerpt cleaned up
        const firstLine = e.excerpt.split('\n')[0]?.trim();
        if (firstLine && firstLine !== e.name && firstLine.length < 80) {
          symbolLine += `  # ${firstLine}`;
        }
      }
      lines.push(symbolLine);
    }
  }

  return lines.join('\n');
}

export interface RepoMapSessionResult {
  repoMap: RepoMap;
  renderedText: string;
  tokensEstimate: number;
  fromCache: boolean;
}

/**
 * Session injector service for repo maps.
 * Maintains an mtime/fingerprint-based cache to inject repo maps in <1ms at session startup.
 */
export class RepoMapSessionService {
  private cachedFingerprint: string | null = null;
  private cachedResult: { repoMap: RepoMap; text: string } | null = null;

  /**
   * Generate or retrieve cached repo map for session context injection (<2k tokens).
   */
  generateSessionRepoMap(
    nodes: CodeNode[],
    edges: CodeEdge[],
    budgetTokens = 2000,
    options: PageRankOptions & TreeRepoMapOptions = {},
  ): RepoMapSessionResult {
    // Fingerprint based on node count, edge count, and newest indexedAt
    let maxIndexedAt = 0;
    for (const n of nodes) {
      if (n.indexedAt > maxIndexedAt) maxIndexedAt = n.indexedAt;
    }
    const fingerprint = `${nodes.length}:${edges.length}:${maxIndexedAt}:${budgetTokens}`;

    if (this.cachedFingerprint === fingerprint && this.cachedResult) {
      return {
        repoMap: this.cachedResult.repoMap,
        renderedText: this.cachedResult.text,
        tokensEstimate: estimateTokens(this.cachedResult.text),
        fromCache: true,
      };
    }

    const repoMap = getRepoMap(nodes, edges, budgetTokens, options);
    const text = renderTreeRepoMap(repoMap, options);

    this.cachedFingerprint = fingerprint;
    this.cachedResult = { repoMap, text };

    return {
      repoMap,
      renderedText: text,
      tokensEstimate: estimateTokens(text),
      fromCache: false,
    };
  }

  /**
   * Invalidate cache.
   */
  invalidate(): void {
    this.cachedFingerprint = null;
    this.cachedResult = null;
  }
}

/**
 * Helper to format repo map as a system context prompt.
 */
export function injectRepoMapContext(repoMapText: string): {
  role: 'system';
  content: string;
} {
  return {
    role: 'system',
    content: `<repository_map>\n${repoMapText}\n</repository_map>`,
  };
}
