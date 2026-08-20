// ==============================================================================
// GHITA CODING AGENT - Track 3 (v1.1.5-beta1): Content-Addressed Index
// ==============================================================================
// Content-addressed AST parse cache + branch/checkpoint tags catalog.
// Catalog keyed by SHA-256 hash of file content. Switching branches / commits
// reuses cached AST entities with >=90% hit rate without re-parsing files.
// ==============================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseFile, type ParseResult } from './ast-parser.js';
import type { PauseToken } from './pause-token.js';
import type { SQLiteGraphStore } from './store.js';
import type { ParseOptions, ContentCacheEntry } from './types.js';

export interface ContentIndexOptions {
  store?: SQLiteGraphStore | null;
}

export interface ContentIndexStats {
  hits: number;
  misses: number;
  hitRate: number;
  cachedEntries: number;
  taggedFiles: number;
}

export class ContentAddressedIndex {
  private store: SQLiteGraphStore | null = null;
  private memoryCache = new Map<string, ContentCacheEntry>();
  private tagMap = new Map<string, Set<string>>(); // filePath -> Set<tag>
  private reverseTagMap = new Map<string, Set<string>>(); // tag -> Set<filePath>
  private hits = 0;
  private misses = 0;

  constructor(options: ContentIndexOptions = {}) {
    this.store = options.store ?? null;
  }

  /**
   * Attach or detach an SQLite storage adapter.
   */
  setStore(store: SQLiteGraphStore | null): void {
    this.store = store;
  }

  /**
   * Compute SHA-256 hash of a string or buffer.
   */
  static hashContent(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Compute/retrieve AST parse results for a file by content hash.
   * 4-Op Core: Operation 1 - compute.
   */
  async compute(
    filePath: string,
    options: ParseOptions & { content?: string; pauseToken?: PauseToken } = {},
  ): Promise<ParseResult> {
    if (options.pauseToken) {
      await options.pauseToken.waitIfPaused();
    }

    const resolvedPath = path.resolve(filePath);
    let content = options.content;
    if (content === undefined) {
      content = fs.readFileSync(resolvedPath, 'utf-8');
    }

    const contentHash = ContentAddressedIndex.hashContent(content);

    // 1. Check in-memory cache
    let cached = this.memoryCache.get(contentHash);

    // 2. Check SQLite store if not in memory
    if (!cached && this.store) {
      const storeEntry = this.store.getCachedParseResult(contentHash);
      if (storeEntry) {
        cached = storeEntry;
        this.memoryCache.set(contentHash, storeEntry);
      }
    }

    if (cached) {
      this.hits++;
      return this.remapCachedResult(cached, resolvedPath);
    }

    // Cache miss — perform AST parse
    this.misses++;
    const parsed = parseFile(resolvedPath, options);

    const entry: ContentCacheEntry = {
      contentHash,
      filePath: resolvedPath,
      nodes: parsed.nodes,
      edges: parsed.edges,
      imports: parsed.imports,
      createdAt: Date.now(),
    };

    this.memoryCache.set(contentHash, entry);
    if (this.store) {
      this.store.setCachedParseResult(entry);
    }

    return parsed;
  }

  /**
   * Synchronous compute method (when PauseToken is not awaiting or used in sync context).
   */
  computeSync(filePath: string, options: ParseOptions & { content?: string } = {}): ParseResult {
    const resolvedPath = path.resolve(filePath);
    let content = options.content;
    if (content === undefined) {
      content = fs.readFileSync(resolvedPath, 'utf-8');
    }

    const contentHash = ContentAddressedIndex.hashContent(content);

    let cached = this.memoryCache.get(contentHash);
    if (!cached && this.store) {
      const storeEntry = this.store.getCachedParseResult(contentHash);
      if (storeEntry) {
        cached = storeEntry;
        this.memoryCache.set(contentHash, storeEntry);
      }
    }

    if (cached) {
      this.hits++;
      return this.remapCachedResult(cached, resolvedPath);
    }

    this.misses++;
    const parsed = parseFile(resolvedPath, options);
    const entry: ContentCacheEntry = {
      contentHash,
      filePath: resolvedPath,
      nodes: parsed.nodes,
      edges: parsed.edges,
      imports: parsed.imports,
      createdAt: Date.now(),
    };

    this.memoryCache.set(contentHash, entry);
    if (this.store) {
      this.store.setCachedParseResult(entry);
    }

    return parsed;
  }

  /**
   * Remap a cached parse result to a (possibly different) file path.
   * Node ids and edge endpoints that belong to the cached file are rewritten
   * with a prefix swap — never a regex/substring replace — so ids containing
   * the path more than once or with regex-special characters stay intact.
   */
  private remapCachedResult(cached: ContentCacheEntry, resolvedPath: string): ParseResult {
    const swapPrefix = (id: string): string =>
      id.startsWith(cached.filePath) ? resolvedPath + id.slice(cached.filePath.length) : id;

    const nodes = cached.nodes.map((n) => ({
      ...n,
      filePath: resolvedPath,
      id: `${resolvedPath}::${n.qualifiedName}`,
    }));
    const edges = cached.edges.map((e) => ({
      ...e,
      from: swapPrefix(e.from),
      to: swapPrefix(e.to),
    }));
    const imports = cached.imports.map((imp) => ({
      ...imp,
      sourceFile: resolvedPath,
    }));

    return { nodes, edges, imports };
  }

  /**
   * 4-Op Core: Operation 2 - delete.
   * Remove a file from active tracking and remove its tags.
   */
  delete(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    const tags = this.tagMap.get(resolvedPath);
    if (tags) {
      for (const tag of tags) {
        const fileSet = this.reverseTagMap.get(tag);
        if (fileSet) {
          fileSet.delete(resolvedPath);
          if (fileSet.size === 0) this.reverseTagMap.delete(tag);
        }
        if (this.store) {
          this.store.removeFileTag(resolvedPath, tag);
        }
      }
      this.tagMap.delete(resolvedPath);
      return true;
    }
    return false;
  }

  /**
   * 4-Op Core: Operation 3 - addTag.
   * Add a branch/checkpoint tag to a file path (e.g. "branch:main", "v1.0.0").
   */
  addTag(filePath: string, tag: string): void {
    const resolvedPath = path.resolve(filePath);
    let tags = this.tagMap.get(resolvedPath);
    if (!tags) {
      tags = new Set();
      this.tagMap.set(resolvedPath, tags);
    }
    tags.add(tag);

    let fileSet = this.reverseTagMap.get(tag);
    if (!fileSet) {
      fileSet = new Set();
      this.reverseTagMap.set(tag, fileSet);
    }
    fileSet.add(resolvedPath);

    if (this.store) {
      this.store.addFileTag(resolvedPath, tag);
    }
  }

  /**
   * 4-Op Core: Operation 4 - removeTag.
   * Remove a branch/checkpoint tag from a file path.
   */
  removeTag(filePath: string, tag: string): void {
    const resolvedPath = path.resolve(filePath);
    const tags = this.tagMap.get(resolvedPath);
    if (tags) {
      tags.delete(tag);
      if (tags.size === 0) this.tagMap.delete(resolvedPath);
    }

    const fileSet = this.reverseTagMap.get(tag);
    if (fileSet) {
      fileSet.delete(resolvedPath);
      if (fileSet.size === 0) this.reverseTagMap.delete(tag);
    }

    if (this.store) {
      this.store.removeFileTag(resolvedPath, tag);
    }
  }

  /**
   * Get all tags associated with a file.
   */
  getTags(filePath: string): string[] {
    const resolvedPath = path.resolve(filePath);
    const tags = this.tagMap.get(resolvedPath);
    if (tags) return [...tags];
    if (this.store) {
      return this.store.getFileTags(resolvedPath);
    }
    return [];
  }

  /**
   * Get all files associated with a tag.
   */
  getFilesByTag(tag: string): string[] {
    const fileSet = this.reverseTagMap.get(tag);
    if (fileSet) return [...fileSet];
    if (this.store) {
      return this.store.getFilesByTag(tag);
    }
    return [];
  }

  /**
   * Remove a tag from all files.
   */
  removeTagFromAll(tag: string): void {
    this.reverseTagMap.delete(tag);
    for (const tags of this.tagMap.values()) {
      tags.delete(tag);
    }
    if (this.store) {
      this.store.removeTagFromAll(tag);
    }
  }

  /**
   * Retrieve indexing cache and tag statistics.
   */
  getStats(): ContentIndexStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? Math.round((this.hits / total) * 1000) / 10 : 0;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      cachedEntries: this.memoryCache.size,
      taggedFiles: this.tagMap.size,
    };
  }

  /**
   * Reset cache statistics.
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Clear in-memory caches and tags.
   */
  clear(): void {
    this.memoryCache.clear();
    this.tagMap.clear();
    this.reverseTagMap.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
