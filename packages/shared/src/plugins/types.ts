// ==============================================================================
// GHITA CODING AGENT - Plugin API & Types
// ==============================================================================

import { Skill, SkillResult } from '../types.js';

export type PluginType = 'code' | 'bundle';

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  type: PluginType;
  entrypoint?: string; // Standard path to JS entry file for 'code' type
  website?: string;
  permissions?: string[]; // list of requested permissions, e.g., ['fs', 'terminal', 'network']
  dependencies?: Record<string, string>;
  skills?: Skill[]; // Pre-packaged skills for 'bundle' type
  mcpServers?: Record<string, McpServerConfig>; // Pre-packaged MCP server configs
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface PluginHooks {
  onLoad?: () => Promise<void> | void;
  onUnload?: () => Promise<void> | void;
  preTool?: (toolName: string, input: unknown) => Promise<{ allowed: boolean; reason?: string; modifiedInput?: unknown }> | { allowed: boolean; reason?: string; modifiedInput?: unknown };
  postTool?: (toolName: string, input: unknown, result: SkillResult) => Promise<SkillResult | void> | SkillResult | void;
}

export interface GhitaPlugin {
  manifest: PluginManifest;
  enabled: boolean;
  hooks?: PluginHooks;
  loadedAt?: number;
}

export interface CodePlugin extends GhitaPlugin {
  manifest: PluginManifest & { type: 'code'; entrypoint: string };
  hooks: PluginHooks;
}

export interface BundlePlugin extends GhitaPlugin {
  manifest: PluginManifest & { type: 'bundle' };
  skills: Skill[];
  mcpServers?: Record<string, McpServerConfig>;
}
