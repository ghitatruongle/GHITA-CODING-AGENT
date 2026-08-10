// ==============================================================================
// GHITA CODING AGENT - Marketplace v1.1.0 Track 3 P37: Claude plugin import
// ==============================================================================
// Parses `.claude-plugin/plugin.json` and `marketplace.json` (Claude Code
// ecosystem format) into native GHITA PluginManifest objects.
// ==============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { validateManifest } from '../manifest.js';
import type { PluginManifest } from '../types.js';

export interface ClaudePluginJson {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  license?: string;
  repository?: string;
  homepage?: string;
  entrypoint?: string;
  commands?: unknown[];
  agents?: unknown[];
  skills?: unknown[];
  hooks?: Record<string, unknown>;
  mcp?: unknown;
  [key: string]: unknown;
}

export interface ClaudeMarketplacePlugin {
  name: string;
  source: string;
  version?: string;
  description?: string;
  author?: string;
  license?: string;
  tags?: string[];
  paths?: {
    command?: string;
    agent?: string;
    skill?: string;
    hook?: string;
    mcp?: string;
  };
  [key: string]: unknown;
}

export interface ClaudeMarketplaceJson {
  plugins?: ClaudeMarketplacePlugin[];
  categories?: string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PluginImportResult {
  manifest?: PluginManifest;
  warnings: string[];
}

/** Derive a conservative permission set from plugin shape. */
function derivePermissions(plugin: ClaudePluginJson): PluginManifest['permissions'] {
  const permissions: PluginManifest['permissions'] = [];
  if (plugin.mcp) permissions.push('network:http');
  if (plugin.hooks && typeof plugin.hooks === 'object') {
    const hookNames = Object.keys(plugin.hooks).join(' ');
    if (/tool|command/i.test(hookNames)) permissions.push('filesystem:read');
    if (/notification/i.test(hookNames)) permissions.push('notification:send');
  }
  return permissions;
}

/** Ensure repository is a valid URL (github shorthand → https URL). */
function normalizeRepoUrl(source: string | undefined): string | undefined {
  if (!source) return undefined;
  if (/^https?:\/\//i.test(source)) return source;
  if (source.includes('github.com')) return source;
  return `https://github.com/${source.replace(/^git\+/, '')}`;
}

/**
 * Convert a Claude Code `plugin.json` into a GHITA PluginManifest.
 */
export function importClaudePluginJson(raw: unknown, id: string): PluginImportResult {
  const warnings: string[] = [];
  const plugin = (raw ?? {}) as ClaudePluginJson;
  if (!plugin.name || !plugin.version) {
    warnings.push('plugin.json missing name or version (required)');
    return { manifest: undefined, warnings };
  }

  try {
    const manifest = validateManifest({
      id,
      name: plugin.name,
      description: plugin.description ?? `Claude Code plugin: ${plugin.name}`,
      version: plugin.version,
      author: plugin.author ?? 'unknown',
      license: plugin.license,
      repository: normalizeRepoUrl(plugin.repository),
      homepage: plugin.homepage,
      category: 'extension',
      tags: [],
      entrypoint: plugin.entrypoint ?? 'src/index.js',
      tools: [],
      permissions: derivePermissions(plugin),
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { manifest, warnings };
  } catch (err) {
    warnings.push(
      `plugin manifest failed validation: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { manifest: undefined, warnings };
  }
}

/**
 * Parse a Claude Code `marketplace.json` into a list of plugin import results.
 */
export function importClaudeMarketplaceJson(raw: unknown): PluginImportResult[] {
  const marketplace = (raw ?? {}) as ClaudeMarketplaceJson;
  const results: PluginImportResult[] = [];
  for (const plugin of marketplace.plugins ?? []) {
    const id = plugin.name.replace(/[^a-z0-9._/-]/gi, '-').toLowerCase();
    const warnings: string[] = [];
    if (!plugin.source) {
      warnings.push('marketplace plugin missing source (required)');
      results.push({ manifest: undefined, warnings });
      continue;
    }
    try {
      const manifest = validateManifest({
        id: id || `plugin-${results.length}`,
        name: plugin.name,
        description: plugin.description ?? `Marketplace plugin: ${plugin.name}`,
        version: plugin.version ?? '1.0.0',
        author: plugin.author ?? 'unknown',
        license: plugin.license,
        repository: normalizeRepoUrl(plugin.source),
        category: 'integration',
        tags: plugin.tags ?? [],
        entrypoint: 'src/index.js',
        tools: [],
        permissions: [],
        downloads: 0,
        rating: 0,
        ratingCount: 0,
        publishedAt: Date.now(),
        updatedAt: Date.now(),
      });
      results.push({ manifest, warnings });
    } catch (err) {
      warnings.push(
        `plugin manifest failed validation: ${err instanceof Error ? err.message : String(err)}`,
      );
      results.push({ manifest: undefined, warnings });
    }
  }
  return results;
}

/** Locate the plugin manifest file inside a checked-out plugin directory. */
export function findClaudePluginManifestFiles(root: string): string[] {
  const candidates = [
    `${root}/.claude-plugin/plugin.json`,
    `${root}/.claude-plugin/marketplace.json`,
    `${root}/plugin.json`,
    `${root}/marketplace.json`,
  ];
  return candidates.filter((c) => existsSync(c));
}

/** Read and parse the first available manifest in a plugin directory. */
export function loadClaudePluginFromDir(root: string, id: string): PluginImportResult {
  const files = findClaudePluginManifestFiles(root);
  if (files.length === 0) {
    return {
      manifest: undefined,
      warnings: ['no plugin.json/marketplace.json found in plugin dir'],
    };
  }
  try {
    const manifestFile = files[0];
    if (manifestFile === undefined) {
      return {
        manifest: undefined,
        warnings: ['no plugin.json/marketplace.json found in plugin dir'],
      };
    }
    const raw = JSON.parse(readFileSync(manifestFile, 'utf-8')) as unknown;
    if (manifestFile.includes('marketplace')) {
      const results = importClaudeMarketplaceJson(raw);
      return (
        results[0] ?? { manifest: undefined, warnings: ['marketplace.json contains no plugins'] }
      );
    }
    return importClaudePluginJson(raw, id);
  } catch (err) {
    return {
      manifest: undefined,
      warnings: [`failed to parse manifest: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}
