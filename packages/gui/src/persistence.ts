// ==============================================================================
// GHITA CODING AGENT - Window State Persistence (Phase 33)
// ==============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PersistedWindow } from './types.js';

/**
 * File-backed store for window geometry & visibility. Defaults to in-process memory
 * if the directory is not provided; production would use the OS app data dir.
 */
export class WindowStateStore {
  private readonly filePath: string | undefined;
  private cache: PersistedWindow[] | undefined;

  constructor(opts: { filePath?: string } = {}) {
    this.filePath = opts.filePath;
  }

  load(): PersistedWindow[] {
    if (this.cache) return [...this.cache];
    if (!this.filePath) {
      this.cache = [];
      return [];
    }
    if (!existsSync(this.filePath)) {
      this.cache = [];
      return [];
    }
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedWindow[];
      this.cache = Array.isArray(parsed) ? parsed : [];
      return [...this.cache];
    } catch {
      this.cache = [];
      return [];
    }
  }

  save(windows: PersistedWindow[]): void {
    this.cache = windows;
    if (!this.filePath) return;
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(windows, null, 2), 'utf8');
    } catch {
      // best-effort: keep in-memory copy
    }
  }

  /** Convenience path helper for the default app config dir */
  static defaultPath(appDataDir: string): string {
    return join(appDataDir, 'window-state.json');
  }
}
