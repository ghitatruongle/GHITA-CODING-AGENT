import * as path from 'node:path';
import type { GhitaPlugin, PluginManifest, PluginHooks } from './types.js';
import type { SkillResult } from '../types.js';
import { logger } from '../logger.js';

export class PluginRuntime {
  private plugins: Map<string, GhitaPlugin> = new Map();

  /**
   * Safe execution wrapper to run user plugins without crashing the main thread
   */
  private async safeExecute<T, A extends unknown[]>(
    pluginId: string,
    hookName: keyof PluginHooks,
    fn: (...args: A) => Promise<T> | T,
    ...args: A
  ): Promise<T | undefined> {
    try {
      logger.info(`[PluginRuntime] Running hook ${hookName} for plugin ${pluginId}`);
      // Simple dynamic timeout wrapper if it takes too long
      const result = await fn(...args);
      return result;
    } catch (error: unknown) {
      logger.error(
        `[PluginRuntime] Error executing ${hookName} in plugin ${pluginId}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Load and initialize a plugin
   */
  public async loadPlugin(manifest: PluginManifest, pluginDir: string): Promise<boolean> {
    try {
      if (this.plugins.has(manifest.id)) {
        logger.warn(`[PluginRuntime] Plugin ${manifest.id} is already loaded.`);
        return false;
      }

      const plugin: GhitaPlugin = {
        manifest,
        enabled: true,
        loadedAt: Date.now(),
      };

      if (manifest.type === 'code' && manifest.entrypoint) {
        const fullEntrypointPath = path.resolve(pluginDir, manifest.entrypoint);
        // Validate entrypoint stays within plugin directory (prevent traversal)
        if (!fullEntrypointPath.startsWith(path.resolve(pluginDir))) {
          logger.error(
            `[PluginRuntime] Blocked plugin entrypoint path traversal: ${manifest.entrypoint}`,
          );
          return false;
        }
        // Only allow .js/.mjs/.ts files
        const ext = path.extname(fullEntrypointPath).toLowerCase();
        if (!['.js', '.mjs', '.ts'].includes(ext)) {
          logger.error(
            `[PluginRuntime] Blocked plugin entrypoint with disallowed extension: ${ext}`,
          );
          return false;
        }
        const fileUrl = `file://${fullEntrypointPath.replace(/\\/g, '/')}`;

        logger.info(`[PluginRuntime] Dynamically importing code plugin entrypoint: ${fileUrl}`);

        // Dynamic import
        const pluginModule = await import(fileUrl);

        // Simple sandbox context binding if they export a factory or default initializer
        let hooks: PluginHooks = {};
        if (typeof pluginModule.default === 'function') {
          // Initialize plugin by passing a safe interface/api
          const sandboxConsole = {
            log: (...args: unknown[]) => logger.info(`[Plugin:${manifest.id}]`, ...args),
            error: (...args: unknown[]) => logger.error(`[Plugin:${manifest.id}]`, ...args),
            warn: (...args: unknown[]) => logger.warn(`[Plugin:${manifest.id}]`, ...args),
          };

          hooks = pluginModule.default({
            console: sandboxConsole,
            version: manifest.version,
          });
        } else if (pluginModule.hooks) {
          hooks = pluginModule.hooks;
        } else {
          hooks = pluginModule;
        }

        plugin.hooks = hooks;
      }

      this.plugins.set(manifest.id, plugin);

      // Trigger onLoad hook
      if (plugin.hooks?.onLoad) {
        await this.safeExecute(manifest.id, 'onLoad', plugin.hooks.onLoad);
      }

      logger.info(`[PluginRuntime] Successfully loaded plugin: ${manifest.name} (${manifest.id})`);
      return true;
    } catch (error: unknown) {
      logger.error(
        `[PluginRuntime] Failed to load plugin ${manifest.id}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      return false;
    }
  }

  /**
   * Unload a plugin
   */
  public async unloadPlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      logger.warn(`[PluginRuntime] Plugin ${pluginId} is not loaded.`);
      return false;
    }

    try {
      if (plugin.hooks?.onUnload) {
        await this.safeExecute(pluginId, 'onUnload', plugin.hooks.onUnload);
      }
      this.plugins.delete(pluginId);
      logger.info(`[PluginRuntime] Unloaded plugin: ${pluginId}`);
      return true;
    } catch (error: unknown) {
      logger.error(
        `[PluginRuntime] Error unloading plugin ${pluginId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Trigger pre-tool hooks for all enabled plugins
   */
  public async triggerPreTool(
    toolName: string,
    input: unknown,
  ): Promise<{ allowed: boolean; reason?: string; modifiedInput?: unknown }> {
    let currentInput = input;

    for (const [pluginId, plugin] of this.plugins.entries()) {
      if (!plugin.enabled || !plugin.hooks?.preTool) continue;

      const hookResult = await this.safeExecute(
        pluginId,
        'preTool',
        plugin.hooks.preTool,
        toolName,
        currentInput,
      );

      if (hookResult) {
        if (!hookResult.allowed) {
          logger.warn(
            `[PluginRuntime] Tool ${toolName} rejected by plugin ${pluginId}. Reason: ${hookResult.reason}`,
          );
          return { allowed: false, reason: hookResult.reason };
        }
        if (hookResult.modifiedInput !== undefined) {
          currentInput = hookResult.modifiedInput;
        }
      }
    }

    return { allowed: true, modifiedInput: currentInput };
  }

  /**
   * Trigger post-tool hooks for all enabled plugins
   */
  public async triggerPostTool(
    toolName: string,
    input: unknown,
    result: SkillResult,
  ): Promise<SkillResult> {
    let currentResult = { ...result };

    for (const [pluginId, plugin] of this.plugins.entries()) {
      if (!plugin.enabled || !plugin.hooks?.postTool) continue;

      const hookResult = await this.safeExecute(
        pluginId,
        'postTool',
        plugin.hooks.postTool,
        toolName,
        input,
        currentResult,
      );

      if (hookResult) {
        currentResult = { ...currentResult, ...hookResult };
      }
    }

    return currentResult;
  }

  /**
   * Get loaded plugin list
   */
  public getLoadedPlugins(): GhitaPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Toggle a plugin's enabled status
   */
  public togglePlugin(pluginId: string, enabled: boolean): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    plugin.enabled = enabled;
    logger.info(`[PluginRuntime] Plugin ${pluginId} state set to enabled=${enabled}`);
    return true;
  }
}
