// ==============================================================================
// GHITA CODING AGENT - Phase 13: Code Search Engine
// ==============================================================================
// Fuzzy search by symbol name, function, class, module with relevance scoring.
// ==============================================================================

import type { CodeNode, SearchQuery, SearchResult, SearchScope } from './types.js';

// ---------------------------------------------------------------------------
// Scope → kind mapping
// ---------------------------------------------------------------------------

const SCOPE_KIND_MAP: Record<SearchScope, CodeNode['kind'][] | null> = {
  all: null,
  function: ['function'],
  class: ['class'],
  interface: ['interface'],
  module: ['module'],
  type: ['type'],
  enum: ['enum'],
};

// ---------------------------------------------------------------------------
// Search Engine
// ---------------------------------------------------------------------------

export class SearchEngine {
  private nodes: CodeNode[] = [];
  private index: Map<string, CodeNode[]> = new Map();

  /**
   * Build/rebuild the search index from a list of nodes.
   */
  buildIndex(nodes: CodeNode[]): void {
    this.nodes = nodes;
    this.index.clear();

    for (const node of nodes) {
      // Index by name (lowercase)
      const nameLower = node.name.toLowerCase();
      this.addToIndex(nameLower, node);

      // Index by qualified name parts
      const parts = node.qualifiedName.toLowerCase().split('.');
      for (const part of parts) {
        if (part !== nameLower) {
          this.addToIndex(part, node);
        }
      }

      // Index by tags
      for (const tag of node.tags) {
        if (tag !== nameLower) {
          this.addToIndex(tag, node);
        }
      }

      // Index by kind
      this.addToIndex(node.kind, node);
    }
  }

  /**
   * Search the index with a query.
   */
  search(query: SearchQuery): SearchResult[] {
    const pattern = query.pattern.toLowerCase().trim();
    if (!pattern) return [];

    const scope = query.scope ?? 'all';
    const limit = query.limit ?? 50;
    const minScore = query.minScore ?? 0;
    const includeExcerpt = query.includeExcerpt ?? true;
    const kindFilter = SCOPE_KIND_MAP[scope];

    // Gather candidates
    const candidates = this.findCandidates(pattern, kindFilter, query.filePrefix);

    // Score and rank
    const scored: SearchResult[] = [];
    for (const { node, matchType } of candidates) {
      const score = this.calculateScore(node, pattern, matchType);
      if (score < minScore) continue;

      const highlights = this.findHighlights(node, pattern);
      const result: SearchResult = {
        node: includeExcerpt ? node : { ...node, excerpt: '' },
        score,
        highlights,
      };
      scored.push(result);
    }

    // Sort by score descending, then by name alphabetically
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.node.name.localeCompare(b.node.name);
    });

    return scored.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private addToIndex(key: string, node: CodeNode): void {
    let bucket = this.index.get(key);
    if (!bucket) {
      bucket = [];
      this.index.set(key, bucket);
    }
    // Avoid duplicates
    if (!bucket.some((n) => n.id === node.id)) {
      bucket.push(node);
    }
  }

  private findCandidates(
    pattern: string,
    kindFilter: CodeNode['kind'][] | null,
    filePrefix?: string,
  ): Array<{ node: CodeNode; matchType: MatchType }> {
    const seen = new Set<string>();
    const results: Array<{ node: CodeNode; matchType: MatchType }> = [];

    // 1. Exact name match (highest priority)
    const exactMatches = this.index.get(pattern);
    if (exactMatches) {
      for (const node of exactMatches) {
        if (node.name.toLowerCase() === pattern) {
          if (this.passesFilters(node, kindFilter, filePrefix)) {
            if (!seen.has(node.id)) {
              seen.add(node.id);
              results.push({ node, matchType: 'exact' });
            }
          }
        }
      }
    }

    // 2. Prefix match
    for (const [key, bucket] of this.index) {
      if (key.startsWith(pattern)) {
        for (const node of bucket) {
          if (!seen.has(node.id) && this.passesFilters(node, kindFilter, filePrefix)) {
            seen.add(node.id);
            results.push({
              node,
              matchType: node.name.toLowerCase().startsWith(pattern) ? 'prefix' : 'tag',
            });
          }
        }
      }
    }

    // 3. Substring match on name
    for (const node of this.nodes) {
      if (!seen.has(node.id) && this.passesFilters(node, kindFilter, filePrefix)) {
        if (node.name.toLowerCase().includes(pattern)) {
          seen.add(node.id);
          results.push({ node, matchType: 'substring' });
        }
      }
    }

    // 4. Tag match
    for (const node of this.nodes) {
      if (!seen.has(node.id) && this.passesFilters(node, kindFilter, filePrefix)) {
        if (node.tags.some((t) => t.includes(pattern))) {
          seen.add(node.id);
          results.push({ node, matchType: 'tag' });
        }
      }
    }

    // 5. Fuzzy / camelCase match
    const camelParts = pattern.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/\s+/);
    if (camelParts.length > 1) {
      for (const node of this.nodes) {
        if (!seen.has(node.id) && this.passesFilters(node, kindFilter, filePrefix)) {
          const nameLower = node.name.toLowerCase();
          if (camelParts.every((p) => nameLower.includes(p))) {
            seen.add(node.id);
            results.push({ node, matchType: 'fuzzy' });
          }
        }
      }
    }

    return results;
  }

  private passesFilters(
    node: CodeNode,
    kindFilter: CodeNode['kind'][] | null,
    filePrefix?: string,
  ): boolean {
    if (kindFilter && !kindFilter.includes(node.kind)) return false;
    if (filePrefix && !node.filePath.toLowerCase().includes(filePrefix.toLowerCase())) return false;
    return true;
  }

  private calculateScore(node: CodeNode, pattern: string, matchType: MatchType): number {
    let base: number;

    switch (matchType) {
      case 'exact':
        base = 1.0;
        break;
      case 'prefix':
        base = 0.85;
        break;
      case 'substring':
        base = 0.65;
        break;
      case 'tag':
        base = 0.5;
        break;
      case 'fuzzy':
        base = 0.35;
        break;
    }

    // Boost exported symbols
    if (node.exported) base += 0.05;

    // Boost functions and classes over variables
    if (node.kind === 'function' || node.kind === 'class') base += 0.03;
    if (node.kind === 'interface' || node.kind === 'type') base += 0.02;

    // Penalize very long names (likely not what user wants)
    if (node.name.length > 40) base -= 0.05;

    // Boost by name similarity (Levenshtein-like ratio)
    const ratio = pattern.length / Math.max(node.name.length, pattern.length);
    base += ratio * 0.1;

    return Math.max(0, Math.min(1, base));
  }

  private findHighlights(node: CodeNode, pattern: string): Array<[number, number]> {
    const highlights: Array<[number, number]> = [];
    const nameLower = node.name.toLowerCase();
    const idx = nameLower.indexOf(pattern);

    if (idx >= 0) {
      highlights.push([idx, idx + pattern.length]);
    }

    // Also check qualified name
    const qLower = node.qualifiedName.toLowerCase();
    const qIdx = qLower.indexOf(pattern);
    if (qIdx >= 0 && qIdx !== idx) {
      highlights.push([qIdx, qIdx + pattern.length]);
    }

    return highlights;
  }
}

type MatchType = 'exact' | 'prefix' | 'substring' | 'tag' | 'fuzzy';
