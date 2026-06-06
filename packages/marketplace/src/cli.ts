// ==============================================================================
// GHITA CODING AGENT - Plugin CLI: Install / Uninstall / Update (Phase 31)
// ==============================================================================

import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import type {
  PluginManifest,
  InstalledPlugin,
  InstallOptions,
  CLIResult,
  MarketplaceConfig,
} from './types.js';
import { LockfileManager } from './lockfile.js';
import { MarketplaceRegistry } from './registry.js';
import { validateManifest, compareSemver, manifestFromPackageJson } from './manifest.js';

const DEFAULT_INSTALL_DIR = join(homedir(), '.ghita', 'plugins');
const DEFAULT_LOCKFILE = join(homedir(), '.ghita', 'plugins.lock');

/**
 * Plugin Marketplace CLI.
 * Manages plugin lifecycle: install, uninstall, update, list.
 */
export class PluginCLI {
  private installDir: string;
  private lockfile: LockfileManager;
  private registry: MarketplaceRegistry;

  constructor(config?: Partial<MarketplaceConfig>) {
    this.installDir = config?.installDir ?? DEFAULT_INSTALL_DIR;
    this.lockfile = new LockfileManager(config?.lockfilePath ?? DEFAULT_LOCKFILE);
    this.registry = new MarketplaceRegistry(config);
  }

  /**
   * Install a plugin by ID (optionally at a specific version).
   */
  async install(pluginId: string, versionOrOptions?: string | InstallOptions): Promise<CLIResult> {
    const options: InstallOptions = typeof versionOrOptions === 'string'
      ? {}
      : versionOrOptions ?? {};
    const targetVersion = typeof versionOrOptions === 'string' ? versionOrOptions : undefined;
    const dir = options.installDir ?? this.installDir;

    try {
      // Check if already installed
      if (!options.force) {
        const existing = await this.getInstalled(pluginId);
        if (existing) {
          if (!targetVersion || existing.version === targetVersion) {
            return { success: false, message: `Plugin ${pluginId}@${existing.version} is already installed.` };
          }
        }
      }

      // Fetch manifest from registry
      let manifest: PluginManifest | null;
      if (targetVersion) {
        manifest = await this.registry.getPluginVersion(pluginId, targetVersion);
      } else {
        manifest = await this.registry.getPlugin(pluginId);
      }

      if (!manifest) {
        return { success: false, message: `Plugin ${pluginId} not found in registry.`, errors: ['NOT_FOUND'] };
      }

      // Validate manifest
      const validated = validateManifest(manifest);

      // Create install directory
      const pluginDir = join(dir, validated.id);
      await mkdir(pluginDir, { recursive: true });

      // Write manifest to disk
      const manifestPath = join(pluginDir, 'manifest.json');
      const integrity = this.computeIntegrity(JSON.stringify(validated));

      const installed: InstalledPlugin = {
        ...validated,
        installedAt: Date.now(),
        enabled: true,
        localPath: pluginDir,
        integrity,
      };

      await writeFile(manifestPath, JSON.stringify(installed, null, 2), 'utf-8');

      // Update lockfile
      await this.lockfile.load();
      this.lockfile.upsertEntry(validated, this.registry['config'].registryUrl);
      await this.lockfile.save();

      return { success: true, message: `Installed ${pluginId}@${validated.version}`, plugin: installed };
    } catch (err) {
      return {
        success: false,
        message: `Failed to install ${pluginId}`,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  /**
   * Uninstall a plugin by ID.
   */
  async uninstall(pluginId: string): Promise<CLIResult> {
    const pluginDir = join(this.installDir, pluginId);

    try {
      await rm(pluginDir, { recursive: true, force: true });

      // Update lockfile
      await this.lockfile.load();
      this.lockfile.removeEntry(pluginId);
      await this.lockfile.save();

      return { success: true, message: `Uninstalled ${pluginId}` };
    } catch (err) {
      return {
        success: false,
        message: `Failed to uninstall ${pluginId}`,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  /**
   * Update a plugin to the latest version.
   */
  async update(pluginId: string): Promise<CLIResult> {
    const current = await this.getInstalled(pluginId);
    if (!current) {
      return { success: false, message: `Plugin ${pluginId} is not installed.` };
    }

    const latest = await this.registry.getPlugin(pluginId);
    if (!latest) {
      return { success: false, message: `Plugin ${pluginId} not found in registry.` };
    }

    if (compareSemver(latest.version, current.version) <= 0) {
      return { success: true, message: `${pluginId}@${current.version} is already the latest version.` };
    }

    // Uninstall old, install new
    await this.uninstall(pluginId);
    return this.install(pluginId, latest.version);
  }

  /**
   * Update all installed plugins.
   */
  async updateAll(): Promise<CLIResult[]> {
    const installed = await this.listInstalled();
    const results: CLIResult[] = [];

    const updates = await this.registry.checkUpdates(
      installed.map((p) => ({ id: p.id, version: p.version })),
    );

    for (const [pluginId] of updates) {
      const result = await this.update(pluginId);
      results.push(result);
    }

    return results;
  }

  /**
   * List all installed plugins.
   */
  async listInstalled(): Promise<InstalledPlugin[]> {
    try {
      await mkdir(this.installDir, { recursive: true });
      const entries = await readdir(this.installDir, { withFileTypes: true });
      const plugins: InstalledPlugin[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const manifestPath = join(this.installDir, entry.name, 'manifest.json');
          const content = await readFile(manifestPath, 'utf-8');
          plugins.push(JSON.parse(content) as InstalledPlugin);
        } catch {
          // Skip invalid entries
        }
      }

      return plugins;
    } catch {
      return [];
    }
  }

  /**
   * Get a specific installed plugin.
   */
  async getInstalled(pluginId: string): Promise<InstalledPlugin | null> {
    try {
      const manifestPath = join(this.installDir, pluginId, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as InstalledPlugin;
    } catch {
      return null;
    }
  }

  /**
   * Enable or disable a plugin.
   */
  async setEnabled(pluginId: string, enabled: boolean): Promise<CLIResult> {
    const plugin = await this.getInstalled(pluginId);
    if (!plugin) {
      return { success: false, message: `Plugin ${pluginId} is not installed.` };
    }

    plugin.enabled = enabled;
    const manifestPath = join(this.installDir, pluginId, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(plugin, null, 2), 'utf-8');

    return { success: true, message: `${pluginId} ${enabled ? 'enabled' : 'disabled'}.`, plugin };
  }

  /**
   * Install from a local package.json (development mode).
   */
  async installFromLocal(packageJsonPath: string): Promise<CLIResult> {
    try {
      const content = await readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content) as Record<string, unknown>;
      const manifest = manifestFromPackageJson(pkg);
      const validated = validateManifest(manifest);

      const pluginDir = join(this.installDir, validated.id);
      await mkdir(pluginDir, { recursive: true });

      const installed: InstalledPlugin = {
        ...validated,
        installedAt: Date.now(),
        enabled: true,
        localPath: pluginDir,
      };

      await writeFile(join(pluginDir, 'manifest.json'), JSON.stringify(installed, null, 2), 'utf-8');
      return { success: true, message: `Installed ${validated.id}@${validated.version} from local`, plugin: installed };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to install from local package.json',
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  // --- Private ---

  private computeIntegrity(data: string): string {
    return `sha256-${crypto.createHash('sha256').update(data).digest('base64')}`;
  }
}
