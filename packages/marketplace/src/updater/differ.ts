// ==============================================================================
// GHITA CODING AGENT - Plugin Diff Calculator (Phase 32)
// ==============================================================================

import type { PluginDiff, PluginDiffEntry } from './types.js';

/**
 * Compute a diff between two plugin snapshots (old vs new file maps).
 * Pure function — no I/O, deterministic output.
 */
export class PluginDiffer {
  /**
   * Calculate diff between old and new file maps.
   */
  diff(
    pluginId: string,
    fromVersion: string,
    toVersion: string,
    oldFiles: Map<string, string>,
    newFiles: Map<string, string>,
  ): PluginDiff {
    const entries: PluginDiffEntry[] = [];
    let added = 0;
    let removed = 0;
    let modified = 0;
    let oldTotalSize = 0;
    let newTotalSize = 0;

    // Added + Modified
    for (const [path, newContent] of newFiles) {
      newTotalSize += this.byteSize(newContent);
      const old = oldFiles.get(path);
      if (old === undefined) {
        entries.push({
          path,
          type: 'added',
          newContent,
          newSize: this.byteSize(newContent),
        });
        added++;
      } else {
        oldTotalSize += this.byteSize(old);
        if (old !== newContent) {
          entries.push({
            path,
            type: 'modified',
            oldContent: old,
            newContent,
            oldSize: this.byteSize(old),
            newSize: this.byteSize(newContent),
          });
          modified++;
        }
      }
    }

    // Removed
    for (const [path, oldContent] of oldFiles) {
      if (!newFiles.has(path)) {
        entries.push({
          path,
          type: 'removed',
          oldContent,
          oldSize: this.byteSize(oldContent),
        });
        oldTotalSize += this.byteSize(oldContent);
        removed++;
      }
    }

    return {
      pluginId,
      fromVersion,
      toVersion,
      entries,
      added,
      removed,
      modified,
      oldTotalSize,
      newTotalSize,
    };
  }

  /**
   * Filter diff to only show breaking changes (heuristic: removed/modified of API/manifest files).
   */
  breakingChanges(diff: PluginDiff): PluginDiffEntry[] {
    const breaking = new Set(['package.json', 'manifest.json', 'plugin.json', 'api.d.ts', 'index.js', 'index.ts']);
    return diff.entries.filter(
      (e) => (e.type === 'removed' || e.type === 'modified') && breaking.has(e.path.split('/').pop() ?? ''),
    );
  }

  /**
   * Estimate download size (sum of added + modified).
   */
  estimateDownloadSize(diff: PluginDiff): number {
    return diff.entries.reduce((acc, e) => {
      if (e.type === 'added') return acc + (e.newSize ?? 0);
      if (e.type === 'modified') return acc + (e.newSize ?? 0);
      return acc;
    }, 0);
  }

  /**
   * Whether two diffs are equivalent (same change set).
   */
  isEquivalent(a: PluginDiff, b: PluginDiff): boolean {
    if (a.added !== b.added || a.removed !== b.removed || a.modified !== b.modified) return false;
    const sa = new Set(a.entries.map((e) => `${e.type}:${e.path}`));
    for (const e of b.entries) {
      if (!sa.has(`${e.type}:${e.path}`)) return false;
    }
    return true;
  }

  private byteSize(s: string): number {
    return Buffer.byteLength(s, 'utf8');
  }
}
