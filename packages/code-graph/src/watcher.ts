// Background file watcher and git hook synchronizer for the code knowledge graph.
// Debounces file system changes (<2s latency) and batches updates to prevent spam.

import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { CodeKnowledgeGraph } from './index.js';
import type { ParseOptions } from './types.js';

export interface WatcherOptions {
  /** Debounce delay in milliseconds (default: 300ms) */
  debounceMs?: number;
  /** File extensions to watch (default: ['.ts', '.tsx', '.js', '.jsx']) */
  extensions?: string[];
  /** Substrings / patterns to ignore */
  ignored?: string[];
  /** Parse options to forward to codeGraph.indexFile */
  parseOptions?: ParseOptions;
}

export interface WatcherStats {
  filesIndexed: number;
  filesRemoved: number;
  batchesProcessed: number;
  lastSyncAt: number;
  isWatching: boolean;
  isPaused: boolean;
}

export type WatcherEvent =
  | 'sync-start'
  | 'file-indexed'
  | 'file-removed'
  | 'sync-complete'
  | 'git-hook'
  | 'error';

export class CodeGraphWatcher extends EventEmitter {
  private watcher: fs.FSWatcher | null = null;
  private watchDir: string | null = null;
  private debounceMs: number;
  private extensions: Set<string>;
  private ignored: string[];
  private parseOptions: ParseOptions;

  private pendingChanges = new Map<string, 'change' | 'unlink'>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private _isPaused = false;

  private stats: WatcherStats = {
    filesIndexed: 0,
    filesRemoved: 0,
    batchesProcessed: 0,
    lastSyncAt: 0,
    isWatching: false,
    isPaused: false,
  };

  constructor(
    private readonly codeGraph: CodeKnowledgeGraph,
    options: WatcherOptions = {},
  ) {
    super();
    this.debounceMs = options.debounceMs ?? 300;
    this.extensions = new Set(options.extensions ?? ['.ts', '.tsx', '.js', '.jsx']);
    this.ignored = options.ignored ?? ['node_modules', '.git', 'dist', 'coverage', '.turbo'];
    this.parseOptions = options.parseOptions ?? {};
  }

  /**
   * Start watching a root directory for source code changes.
   */
  start(dir: string): void {
    if (this.watcher) {
      this.stop();
    }

    const resolved = path.resolve(dir);
    this.watchDir = resolved;
    this.stats.isWatching = true;

    try {
      this.watcher = fs.watch(
        resolved,
        { recursive: true },
        (eventType: string, filename: string | null) => {
          if (!filename || this._isPaused) return;
          this.handleRawEvent(resolved, filename, eventType);
        },
      );

      this.watcher.on('error', (err: Error) => {
        this.emit('error', err);
      });
    } catch (err) {
      this.emit('error', err);
    }
  }

  /**
   * Stop the watcher.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.watchDir = null;
    this.stats.isWatching = false;
  }

  /**
   * Pause watching (temporarily ignores FS events without closing watcher).
   */
  pause(): void {
    this._isPaused = true;
    this.stats.isPaused = true;
  }

  /**
   * Resume watching.
   */
  resume(): void {
    this._isPaused = false;
    this.stats.isPaused = false;
  }

  /**
   * Handle an event triggered by a Git hook (post-checkout, post-merge, post-commit).
   */
  handleGitHook(
    hookName: 'post-checkout' | 'post-merge' | 'post-commit',
    branchOrCommit?: string,
  ): void {
    this.emit('git-hook', { hookName, branchOrCommit });
    if (this.watchDir) {
      // Trigger directory re-sync
      this.codeGraph.indexDirectory(this.watchDir, this.parseOptions);
      this.stats.lastSyncAt = Date.now();
      this.emit('sync-complete', { trigger: `git-${hookName}`, filesCount: 0 });
    }
  }

  /**
   * Force flush any pending debounced changes immediately.
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.processPendingChanges();
  }

  /**
   * Get watcher statistics.
   */
  getStats(): WatcherStats {
    return { ...this.stats };
  }

  // Internal Event Processing
  
  private handleRawEvent(baseDir: string, relativePath: string, _eventType: string): void {
    // Check ignored patterns
    const normalized = relativePath.replace(/\\/g, '/');
    for (const ignorePattern of this.ignored) {
      if (normalized.includes(ignorePattern)) return;
    }

    const ext = path.extname(relativePath).toLowerCase();
    if (!this.extensions.has(ext)) return;

    const fullPath = path.resolve(baseDir, relativePath);

    // Determine if file exists or was deleted
    const exists = fs.existsSync(fullPath);
    this.pendingChanges.set(fullPath, exists ? 'change' : 'unlink');

    // Debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.processPendingChanges();
    }, this.debounceMs);
  }

  private async processPendingChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const batch = new Map(this.pendingChanges);
    this.pendingChanges.clear();

    this.emit('sync-start', { batchSize: batch.size });

    let indexedCount = 0;
    let removedCount = 0;

    for (const [filePath, op] of batch) {
      try {
        if (op === 'unlink' || !fs.existsSync(filePath)) {
          // unindexFile removes graph/store/search data without touching the
          // filesystem — indexFile would throw on the missing file and leave
          // stale search-index/store entries behind.
          this.codeGraph.unindexFile(filePath);
          this.stats.filesRemoved++;
          removedCount++;
          this.emit('file-removed', { filePath });
        } else {
          this.codeGraph.indexFile(filePath, this.parseOptions);
          this.stats.filesIndexed++;
          indexedCount++;
          this.emit('file-indexed', { filePath });
        }
      } catch (err) {
        this.emit('error', err);
      }
    }

    this.stats.batchesProcessed++;
    this.stats.lastSyncAt = Date.now();

    this.emit('sync-complete', {
      indexedCount,
      removedCount,
      timestamp: this.stats.lastSyncAt,
    });
  }
}
