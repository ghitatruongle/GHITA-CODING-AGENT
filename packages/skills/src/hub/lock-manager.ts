// =============================================================================
// GHITA CODING AGENT - Phase 12: Lock Manager (lock.json CRUD + Verify)
// =============================================================================
// Manages the lock.json file that tracks installed skills, their versions,
// and content hashes for integrity verification.
// =============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LockFile, LockEntry } from './types.js';

// --- Lock File Default ---
const DEFAULT_LOCK: LockFile = {
  lockfileVersion: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  packages: {},
};

// --- LockManager Class ---

export class LockManager {
  private lockfilePath: string;
  private lockfile: LockFile;

  constructor(lockfilePath: string) {
    this.lockfilePath = lockfilePath;
    this.lockfile = this.load();
  }

  // --- Core CRUD ---

  /**
   * Load lock.json from disk, or create a new one if it doesn't exist.
   */
  load(): LockFile {
    if (fs.existsSync(this.lockfilePath)) {
      try {
        const raw = fs.readFileSync(this.lockfilePath, 'utf-8');
        const parsed = JSON.parse(raw) as LockFile;

        // Validate lockfile version
        if (parsed.lockfileVersion !== 1) {
          console.warn(`[LockManager] Unknown lockfile version: ${parsed.lockfileVersion}, resetting`);
          return { ...DEFAULT_LOCK };
        }

        this.lockfile = parsed;
        return this.lockfile;
      } catch (err) {
        console.error(`[LockManager] Failed to parse lock.json, creating new one:`, err);
        return this.reset();
      }
    }

    return this.reset();
  }

  /**
   * Save lock.json to disk.
   */
  save(): void {
    this.lockfile.updatedAt = Date.now();
    const dir = path.dirname(this.lockfilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.lockfilePath, JSON.stringify(this.lockfile, null, 2), 'utf-8');
  }

  /**
   * Reset lock.json to empty state.
   */
  reset(): LockFile {
    this.lockfile = {
      lockfileVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      packages: {},
    };
    this.save();
    return this.lockfile;
  }

  // --- Package Operations ---

  /**
   * Lock a skill (add or update entry).
   */
  lock(entry: LockEntry): void {
    this.lockfile.packages[entry.id] = {
      ...entry,
      lockedAt: Date.now(),
    };
    this.save();
  }

  /**
   * Unlock (remove) a skill from lockfile.
   */
  unlock(skillId: string): boolean {
    if (this.lockfile.packages[skillId]) {
      delete this.lockfile.packages[skillId];
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Get a locked entry by skill ID.
   */
  get(skillId: string): LockEntry | undefined {
    return this.lockfile.packages[skillId];
  }

  /**
   * Check if a skill is locked.
   */
  isLocked(skillId: string): boolean {
    return skillId in this.lockfile.packages;
  }

  /**
   * List all locked skill IDs.
   */
  listIds(): string[] {
    return Object.keys(this.lockfile.packages);
  }

  /**
   * List all lock entries.
   */
  listEntries(): LockEntry[] {
    return Object.values(this.lockfile.packages);
  }

  /**
   * Get count of locked packages.
   */
  get size(): number {
    return Object.keys(this.lockfile.packages).length;
  }

  // --- Integrity Verification ---

  /**
   * Verify a single locked entry's integrity hash.
   */
  verifyEntry(skillId: string, computeHash: (entry: LockEntry) => string): {
    ok: boolean;
    expected: string;
    actual: string;
    error?: string;
  } {
    const entry = this.lockfile.packages[skillId];
    if (!entry) {
      return { ok: false, expected: '', actual: '', error: `Skill "${skillId}" not in lockfile` };
    }

    const actual = computeHash(entry);
    const ok = actual === entry.integrity;
    return {
      ok,
      expected: entry.integrity,
      actual,
      error: ok ? undefined : `Integrity mismatch for "${skillId}"`,
    };
  }

  /**
   * Verify all locked entries.
   */
  verifyAll(computeHash: (entry: LockEntry) => string): Array<{
    skillId: string;
    ok: boolean;
    expected: string;
    actual: string;
    error?: string;
  }> {
    return this.listIds().map(id => ({
      skillId: id,
      ...this.verifyEntry(id, computeHash),
    }));
  }

  // --- Batch Operations ---

  /**
   * Lock multiple entries at once.
   */
  lockBatch(entries: LockEntry[]): void {
    for (const entry of entries) {
      this.lockfile.packages[entry.id] = {
        ...entry,
        lockedAt: Date.now(),
      };
    }
    this.save();
  }

  /**
   * Remove all entries.
   */
  clear(): void {
    this.lockfile.packages = {};
    this.save();
  }

  /**
   * Get the raw lockfile data.
   */
  getData(): Readonly<LockFile> {
    return this.lockfile;
  }

  // --- Diff ---

  /**
   * Compare current lockfile with a new set of entries.
   * Returns added, removed, and updated entries.
   */
  diff(newEntries: LockEntry[]): {
    added: LockEntry[];
    removed: string[];
    updated: LockEntry[];
    unchanged: string[];
  } {
    const currentMap = new Map<string, LockEntry>();
    for (const id of this.listIds()) {
      const entry = this.lockfile.packages[id];
      if (entry) {
        currentMap.set(id, entry);
      }
    }
    const newMap = new Map(newEntries.map(e => [e.id, e]));

    const added: LockEntry[] = [];
    const removed: string[] = [];
    const updated: LockEntry[] = [];
    const unchanged: string[] = [];

    for (const [id, entry] of newMap) {
      if (!currentMap.has(id)) {
        added.push(entry);
      } else {
        const current = currentMap.get(id);
        if (current && (current.version !== entry.version || current.integrity !== entry.integrity)) {
          updated.push(entry);
        } else {
          unchanged.push(id);
        }
      }
    }

    for (const id of currentMap.keys()) {
      if (!newMap.has(id)) {
        removed.push(id);
      }
    }

    return { added, removed, updated, unchanged };
  }
}
