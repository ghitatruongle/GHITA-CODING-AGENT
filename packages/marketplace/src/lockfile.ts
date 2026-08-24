// Version pinning + lockfile for reproducible installs

import { readFile, writeFile } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import type { PluginLockfile, LockfileEntry, PluginManifest } from './types.js';

const LOCKFILE_VERSION = 1;

/**
 * Manages the plugin lockfile for reproducible installs.
 * The lockfile pins exact versions + integrity hashes.
 */
export class LockfileManager {
  private lockfilePath: string;
  private lockfile: PluginLockfile | null = null;

  constructor(lockfilePath: string) {
    this.lockfilePath = lockfilePath;
  }

  /**
   * Load lockfile from disk. Creates empty if not found.
   */
  async load(): Promise<PluginLockfile> {
    try {
      const content = await readFile(this.lockfilePath, 'utf-8');
      this.lockfile = JSON.parse(content) as PluginLockfile;
      return this.lockfile;
    } catch {
      this.lockfile = {
        lockfileVersion: LOCKFILE_VERSION,
        entries: [],
        generatedAt: Date.now(),
      };
      return this.lockfile;
    }
  }

  /**
   * Save lockfile to disk.
   */
  async save(): Promise<void> {
    if (!this.lockfile) throw new Error('Lockfile not loaded. Call load() first.');
    this.lockfile.generatedAt = Date.now();
    await writeFile(this.lockfilePath, JSON.stringify(this.lockfile, null, 2), 'utf-8');
  }

  /**
   * Get entry for a specific plugin.
   */
  getEntry(pluginId: string): LockfileEntry | undefined {
    return this.lockfile?.entries.find((e) => e.id === pluginId);
  }

  /**
   * Add or update an entry from a manifest.
   */
  upsertEntry(manifest: PluginManifest, registryUrl: string): LockfileEntry {
    if (!this.lockfile) throw new Error('Lockfile not loaded.');

    const integrity = this.computeIntegrity(manifest);
    const entry: LockfileEntry = {
      id: manifest.id,
      version: manifest.version,
      integrity,
      registry: registryUrl,
      dependencies: manifest.dependencies ?? {},
      resolvedAt: Date.now(),
    };

    const existingIdx = this.lockfile.entries.findIndex((e) => e.id === manifest.id);
    if (existingIdx >= 0) {
      this.lockfile.entries[existingIdx] = entry;
    } else {
      this.lockfile.entries.push(entry);
    }

    return entry;
  }

  /**
   * Remove an entry by plugin ID.
   */
  removeEntry(pluginId: string): boolean {
    if (!this.lockfile) return false;
    const idx = this.lockfile.entries.findIndex((e) => e.id === pluginId);
    if (idx < 0) return false;
    this.lockfile.entries.splice(idx, 1);
    return true;
  }

  /**
   * Check if a plugin version matches the locked version.
   */
  isLocked(pluginId: string, version: string): boolean {
    const entry = this.getEntry(pluginId);
    return entry !== undefined && entry.version === version;
  }

  /**
   * Verify integrity of an installed plugin against lockfile.
   */
  verifyIntegrity(manifest: PluginManifest): boolean {
    const entry = this.getEntry(manifest.id);
    if (!entry) return false;
    if (entry.version !== manifest.version) return false;

    const computed = this.computeIntegrity(manifest);
    return computed === entry.integrity;
  }

  /**
   * Get all locked entries.
   */
  get entries(): LockfileEntry[] {
    return this.lockfile?.entries ?? [];
  }

  /**
   * Generate lockfile from a list of manifests.
   */
  generateFromManifests(manifests: PluginManifest[], registryUrl: string): PluginLockfile {
    this.lockfile = {
      lockfileVersion: LOCKFILE_VERSION,
      entries: manifests.map((m) => ({
        id: m.id,
        version: m.version,
        integrity: this.computeIntegrity(m),
        registry: registryUrl,
        dependencies: m.dependencies ?? {},
        resolvedAt: Date.now(),
      })),
      generatedAt: Date.now(),
    };
    return this.lockfile;
  }

  // --- Private ---

  private computeIntegrity(manifest: PluginManifest): string {
    const data = `${manifest.id}@${manifest.version}:${manifest.entrypoint}:${manifest.updatedAt}`;
    return `sha256-${crypto.createHash('sha256').update(data).digest('base64')}`;
  }
}
