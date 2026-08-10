// ==============================================================================
// GHITA CODING AGENT - Skills v1.1.0 Track 2: skill-lock v3 (P31)
// ==============================================================================
// Deterministic folder-hash based lockfile: any file change inside a skill
// directory changes the hash → stale detection for `skills update`.
// ==============================================================================

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export type LockSourceType = 'github' | 'registry' | 'local';
export type LockProvider = 'ghita' | 'claude-code' | 'codex' | 'cursor' | 'vercel';

export interface SkillLockV3Entry {
  id: string;
  ref: string;
  sourceType: LockSourceType;
  provider: LockProvider;
  /** Deterministic folder hash (tree-like: relative path + size + sha256). */
  folderHash: string;
  installedAt: string;
  updatedAt: string;
  files: number;
}

export interface SkillLockV3File {
  version: 3;
  entries: Record<string, SkillLockV3Entry>;
}

/** Compute the deterministic folder hash of a skill directory. */
export function computeFolderHash(dir: string): { hash: string; files: number } {
  const files: string[] = [];
  const walk = (base: string): void => {
    for (const name of readdirSync(base)) {
      const full = join(base, name);
      if (name === '.git' || name === 'node_modules') continue;
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        files.push(relative(dir, full));
      }
    }
  };
  walk(dir);
  files.sort();

  const hash = createHash('sha256');
  for (const rel of files) {
    const content = readFileSync(join(dir, rel));
    hash.update(rel);
    hash.update('\0');
    hash.update(String(content.length));
    hash.update('\0');
    hash.update(content);
  }
  return { hash: hash.digest('hex').slice(0, 32), files: files.length };
}

/** Parse a v3 lockfile JSON (falling back to an empty lock). */
export function parseSkillLockV3(raw: string | undefined): SkillLockV3File {
  if (!raw) return { version: 3, entries: {} };
  try {
    const parsed = JSON.parse(raw) as SkillLockV3File;
    if (parsed.version !== 3 || typeof parsed.entries !== 'object') {
      return { version: 3, entries: {} };
    }
    return parsed;
  } catch {
    return { version: 3, entries: {} };
  }
}

export function serializeSkillLockV3(lock: SkillLockV3File): string {
  return JSON.stringify(lock, null, 2);
}

/** Create or refresh a lock entry for one skill directory. */
export function upsertLockEntry(
  lock: SkillLockV3File,
  entry: Omit<SkillLockV3Entry, 'folderHash' | 'files' | 'updatedAt'> & { dir: string },
): { lock: SkillLockV3File; entry: SkillLockV3Entry } {
  const { hash, files } = computeFolderHash(entry.dir);
  const now = new Date().toISOString();
  const existing = lock.entries[entry.id];
  const updated: SkillLockV3Entry = {
    ...entry,
    folderHash: hash,
    files,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
  };
  return {
    lock: { ...lock, entries: { ...lock.entries, [entry.id]: updated } },
    entry: updated,
  };
}

/** Detect whether the on-disk skill differs from the locked hash (stale). */
export function detectLockChanges(
  lock: SkillLockV3File,
  id: string,
  dir: string,
): { stale: boolean; currentHash: string; expectedHash?: string } {
  const entry = lock.entries[id];
  const { hash } = computeFolderHash(dir);
  if (!entry) return { stale: true, currentHash: hash };
  return { stale: entry.folderHash !== hash, currentHash: hash, expectedHash: entry.folderHash };
}
