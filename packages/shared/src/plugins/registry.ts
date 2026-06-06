// ==============================================================================
// GHITA CODING AGENT - Plugin Registry
// ==============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { PluginManifest } from './types.js';
import { logger } from '../logger.js';

export class PluginRegistry {
  private pluginsPath: string;

  constructor(customPath?: string) {
    this.pluginsPath = customPath || path.join(homedir(), '.ghita', 'plugins');
    this.ensureDirectoryExists();
  }

  /**
   * Ensure the local plugin directory exists
   */
  private ensureDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.pluginsPath)) {
        fs.mkdirSync(this.pluginsPath, { recursive: true });
        logger.info(`[PluginRegistry] Created plugin directory at ${this.pluginsPath}`);
      }
    } catch (error: unknown) {
      logger.error(
        `[PluginRegistry] Failed to create plugin directory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Scan plugins directory and load all manifests
   */
  public discover(): PluginManifest[] {
    const manifests: PluginManifest[] = [];
    try {
      this.ensureDirectoryExists();
      const files = fs.readdirSync(this.pluginsPath);

      for (const file of files) {
        const itemPath = path.join(this.pluginsPath, file);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          const manifestPath = path.join(itemPath, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const content = fs.readFileSync(manifestPath, 'utf8');
              const manifest = JSON.parse(content) as PluginManifest;

              if (this.validateManifest(manifest as PluginManifest | Record<string, unknown>)) {
                manifests.push(manifest);
              } else {
                logger.warn(`[PluginRegistry] Invalid manifest at ${manifestPath}`);
              }
            } catch (jsonErr: unknown) {
              logger.error(
                `[PluginRegistry] Failed to parse manifest in ${file}: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
              );
            }
          }
        }
      }
    } catch (error: unknown) {
      logger.error(
        `[PluginRegistry] Error discovering plugins: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return manifests;
  }

  /**
   * Validate manifest structure
   */
  private validateManifest(
    manifest: PluginManifest | Record<string, unknown>,
  ): manifest is PluginManifest {
    return (
      manifest &&
      typeof manifest.id === 'string' &&
      typeof manifest.name === 'string' &&
      typeof manifest.description === 'string' &&
      typeof manifest.version === 'string' &&
      typeof manifest.author === 'string' &&
      (manifest.type === 'code' || manifest.type === 'bundle')
    );
  }

  /**
   * Get target directory path for a plugin
   */
  public getPluginDir(pluginId: string): string {
    return path.join(this.pluginsPath, pluginId);
  }

  /**
   * Get manifest for a specific plugin
   */
  public getPluginManifest(pluginId: string): PluginManifest | null {
    const manifestPath = path.join(this.getPluginDir(pluginId), 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const content = fs.readFileSync(manifestPath, 'utf8');
        return JSON.parse(content) as PluginManifest;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Install a plugin from a source directory or a bundle JSON object
   */
  public install(manifest: PluginManifest, sourceDirOrFiles?: Record<string, string>): boolean {
    try {
      this.ensureDirectoryExists();
      const targetDir = this.getPluginDir(manifest.id);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Write manifest
      fs.writeFileSync(
        path.join(targetDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8',
      );

      // Write source files if provided (simulating download or packaging)
      if (sourceDirOrFiles) {
        for (const [filename, fileContent] of Object.entries(sourceDirOrFiles)) {
          const filePath = path.join(targetDir, filename);
          // Prevent path traversal: resolved path must stay within targetDir
          const resolved = path.resolve(filePath);
          if (!resolved.startsWith(path.resolve(targetDir))) {
            logger.error(`[PluginRegistry] Blocked path traversal attempt: ${filename}`);
            continue;
          }
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(filePath, fileContent, 'utf8');
        }
      }

      logger.info(`[PluginRegistry] Installed plugin ${manifest.name} (${manifest.id})`);
      return true;
    } catch (error: unknown) {
      logger.error(
        `[PluginRegistry] Failed to install plugin ${manifest.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Uninstall a plugin by ID
   */
  public uninstall(pluginId: string): boolean {
    try {
      const targetDir = this.getPluginDir(pluginId);
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        logger.info(`[PluginRegistry] Uninstalled plugin: ${pluginId}`);
        return true;
      }
      logger.warn(`[PluginRegistry] Plugin ${pluginId} not found, cannot uninstall.`);
      return false;
    } catch (error: unknown) {
      logger.error(
        `[PluginRegistry] Failed to uninstall plugin ${pluginId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Update plugin manifest or source files
   */
  public update(manifest: PluginManifest, sourceDirOrFiles?: Record<string, string>): boolean {
    return this.install(manifest, sourceDirOrFiles);
  }
}
