// ==============================================================================
// GHITA CODING AGENT - Tool Registry Types
// ==============================================================================
// Type definitions for the Composio-pattern tool registry.
// ==============================================================================

import type { BuiltInTool } from './index.js';

/** JSON Schema đơn giản cho tool parameters */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, ToolPropertySpec>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolPropertySpec {
  type: 'string' | 'number' | 'boolean' | 'integer' | 'array' | 'object';
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  items?: ToolPropertySpec;
}

/** Một tool entry trong registry */
export interface ToolDefinition extends BuiltInTool {
  /** Capability tags để group/search (vd: 'file', 'web', 'saas:gmail', 'dev:git') */
  tags: string[];
  /** App/service nguồn (vd: 'builtin', 'composio:gmail', 'custom') */
  source: ToolSource;
  /** Phiên bản schema, bump khi breaking change */
  version: string;
  /** Optional rate limit (calls/phút) */
  rateLimit?: number;
  /** Optional: tool có cần user approval không */
  requiresApproval?: boolean;
}

export type ToolSource =
  | 'builtin'
  | 'custom'
  | 'composio:gmail'
  | 'composio:slack'
  | 'composio:github'
  | 'composio:notion'
  | 'composio:jira'
  | 'composio:linear'
  | 'composio:stripe'
  | 'composio:shopify'
  | 'composio:hubspot'
  | 'composio:salesforce'
  | 'composio:asana'
  | 'composio:trello'
  | 'composio:dropbox'
  | 'composio:gdrive'
  | 'composio:asana'
  | 'composio:sentry'
  | 'composio:datadog'
  | 'composio:aws'
  | 'composio:gcp'
  | 'composio:azure'
  | 'composio:figma'
  | 'composio:miro'
  | string; // custom source id

/** Kết quả execute tool */
export interface ToolExecutionResult {
  ok: boolean;
  output: string;
  durationMs: number;
  tool: string;
  error?: string;
}

/** Subscribe event */
export type RegistryEvent =
  | { type: 'register'; tool: ToolDefinition }
  | { type: 'unregister'; name: string }
  | { type: 'update'; tool: ToolDefinition };

export type RegistryListener = (event: RegistryEvent) => void;

/** Schema for a single tool entry in the catalog */
export interface CatalogToolEntry {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  version?: string;
  rateLimit?: number;
  requiresApproval?: boolean;
}

/** Schema for a grouped tool catalog */
export interface CatalogGroup {
  app: string;
  category: string;
  tools: CatalogToolEntry[];
}
