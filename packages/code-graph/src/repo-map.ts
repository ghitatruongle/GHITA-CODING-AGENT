// ==============================================================================
// v0.4.9 A8: Repo-Map Ranking
//
// Ranks code symbols by importance using PageRank over the reference graph,
// then greedily selects the most important symbols that fit a token budget —
// a "repo map" of high-signal context for an LLM.
// ==============================================================================

import type { CodeEdge, CodeNode } from './types.js';

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

  const ids = new Set(nodes.map((node) => node.id));
  const initial = 1 / n;
  for (const node of nodes) scores.set(node.id, initial);

  // Build outgoing adjacency (weighted) restricted to known nodes + ranking edges.
  const outgoing = new Map<string, Array<{ to: string; weight: number }>>();
  const outWeight = new Map<string, number>();
  for (const edge of edges) {
    if (!RANKING_EDGE_KINDS.has(edge.kind)) continue;
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    const w = edge.weight > 0 ? edge.weight : 1;
    const list = outgoing.get(edge.from) ?? [];
    list.push({ to: edge.to, weight: w });
    outgoing.set(edge.from, list);
    outWeight.set(edge.from, (outWeight.get(edge.from) ?? 0) + w);
  }

  const base = (1 - damping) / n;
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map<string, number>();
    for (const node of nodes) next.set(node.id, base);

    // Distribute dangling-node mass uniformly.
    let danglingMass = 0;
    for (const node of nodes) {
      if (!outgoing.has(node.id)) danglingMass += scores.get(node.id) ?? 0;
    }
    const danglingShare = (damping * danglingMass) / n;

    for (const node of nodes) {
      const score = scores.get(node.id) ?? 0;
      const edgesOut = outgoing.get(node.id);
      if (edgesOut && edgesOut.length > 0) {
        const total = outWeight.get(node.id) ?? edgesOut.length;
        for (const { to, weight } of edgesOut) {
          next.set(to, (next.get(to) ?? 0) + (damping * score * weight) / total);
        }
      }
    }
    if (danglingShare > 0) {
      for (const node of nodes) {
        next.set(node.id, (next.get(node.id) ?? 0) + danglingShare);
      }
    }
    for (const [id, value] of next) scores.set(id, value);
  }

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
  const lines = [`# Repo map (${map.entries.length}/${map.totalSymbols} symbols, ~${map.usedTokens} tokens)`];
  for (const e of map.entries) {
    lines.push(`\n## ${e.qualifiedName} — ${e.kind} (${e.filePath}:${e.startLine})`);
    if (e.excerpt) lines.push(e.excerpt);
  }
  return lines.join('\n');
}
