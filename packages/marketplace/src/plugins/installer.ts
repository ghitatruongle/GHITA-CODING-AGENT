// ==============================================================================
// GHITA CODING AGENT - Marketplace v1.1.0 Track 3 P38: plugin installer
// ==============================================================================
// Install flow: `plugins install <user>/<repo>[@tag]` — resolve source, parse
// the Claude plugin manifest, record into the LockfileManager.
// Fetching is injectable so CI/tests run offline; the default implementation
// uses git clone --depth 1.
// ==============================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, cpSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadClaudePluginFromDir } from './claude-plugin.js';
import type { PluginManifest } from '../types.js';
import type { LockfileManager } from '../lockfile.js';

export interface PluginSpec {
  repo: string;
  ref: string;
}

export interface PluginFetcher {
  (spec: PluginSpec, dest: string): Promise<void>;
}

export interface InstallResult {
  manifest: PluginManifest;
  sourceDir: string;
  installedTo?: string;
  warnings: string[];
  lockEntry?: unknown;
}

/** Parse `<user>/<repo>[@tag|@branch]` into a spec (scoped names supported). */
export function parsePluginSpec(input: string): PluginSpec {
  const trimmed = input.trim();
  const match = trimmed.match(/^(@[^@]+|[^@]+)@(.+)$/);
  if (match) {
    const [, repo, ref] = match;
    return { repo: repo ?? trimmed, ref: ref ?? 'main' };
  }
  return { repo: trimmed, ref: 'main' };
}

/** Default fetcher: shallow git clone of the repo at the given ref. */
export const gitCloneFetcher: PluginFetcher = async (spec, dest) => {
  const url =
    spec.repo.includes('://') || spec.repo.includes('github.com')
      ? spec.repo
      : `https://github.com/${spec.repo}.git`;
  const res = spawnSync('git', ['clone', '--depth', '1', '--branch', spec.ref, url, dest], {
    stdio: 'pipe',
  });
  if (res.status !== 0) {
    throw new Error(`git clone failed: ${res.stderr?.toString() || 'unknown error'}`);
  }
};

/** Copy files from source dir into the plugin install dir (skip .git). */
export function copyPluginFiles(sourceDir: string, destDir: string): string[] {
  mkdirSync(destDir, { recursive: true });
  const copied: string[] = [];
  const walk = (base: string, rel: string): void => {
    for (const name of readdirSync(base)) {
      if (name === '.git' || name === 'node_modules') continue;
      const full = join(base, name);
      const target = join(destDir, rel, name);
      if (statIsDir(full)) {
        mkdirSync(target, { recursive: true });
        walk(full, join(rel, name));
      } else {
        cpSync(full, target);
        copied.push(join(rel, name));
      }
    }
  };
  walk(sourceDir, '');
  return copied;
}

function statIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export interface InstallerOptions {
  /** Where installed plugins live (e.g. ~/.ghita/plugins). */
  installDir: string;
  /** Lockfile manager (optional; locked entry recorded when provided). */
  lockfile?: LockfileManager;
  /** Injectable fetcher (default: gitCloneFetcher). */
  fetcher?: PluginFetcher;
}

export class PluginInstaller {
  constructor(private readonly options: InstallerOptions) {}

  /**
   * Install a plugin from `<user>/<repo>[@ref]`.
   */
  async install(specInput: string, pluginId?: string): Promise<InstallResult> {
    const spec = parsePluginSpec(specInput);
    const temp = resolve(tmpdir(), `ghita-plugin-${randomUUID().slice(0, 8)}`);
    mkdirSync(temp, { recursive: true });
    const fetcher = this.options.fetcher ?? gitCloneFetcher;

    try {
      await fetcher(spec, temp);
      const id =
        pluginId ??
        spec.repo
          .split('/')
          .pop()
          ?.replace(/[^a-z0-9._-]/gi, '-') ??
        'plugin';
      const { manifest, warnings } = loadClaudePluginFromDir(temp, id);
      if (!manifest) {
        return { manifest: undefined as unknown as PluginManifest, sourceDir: temp, warnings };
      }

      const dest = join(resolve(this.options.installDir), manifest.id);
      copyPluginFiles(temp, dest);

      let lockEntry: unknown;
      if (this.options.lockfile) {
        lockEntry = this.options.lockfile.upsertEntry(manifest, spec.repo);
      }

      return { manifest, sourceDir: temp, installedTo: dest, warnings, lockEntry };
    } finally {
      // Cleanup happens in the caller (tests may keep temp for inspection).
      if (existsSync(temp)) {
        // Kept: fetcher output may be useful for debugging; caller decides.
      }
    }
  }
}

/** Convenience: install from a local directory (offline tests). */
export async function installFromLocalDir(
  sourceDir: string,
  pluginId: string,
  options: InstallerOptions,
): Promise<InstallResult> {
  const { manifest, warnings } = loadClaudePluginFromDir(sourceDir, pluginId);
  if (!manifest) {
    return { manifest: undefined as unknown as PluginManifest, sourceDir, warnings };
  }
  const dest = join(resolve(options.installDir), manifest.id);
  copyPluginFiles(sourceDir, dest);
  let lockEntry: unknown;
  if (options.lockfile) {
    lockEntry = options.lockfile.upsertEntry(manifest, 'local');
  }
  return { manifest, sourceDir, installedTo: dest, warnings, lockEntry };
}
