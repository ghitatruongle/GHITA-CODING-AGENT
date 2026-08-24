// When total tool definitions exceed a threshold (default 60), replace the
// full tool list with 3 lightweight bridge tools:
//   - tool_search   : keyword search across name/description/tags
//   - tool_describe : return full schema for a specific tool by name
//   - tool_call     : execute any registered tool by name + args
//
// This keeps context budget under ~5% regardless of registry size.
// Hidden tools remain fully executable via tool_call.
// Pattern: hermes tool_search.py 3-tier bridge.

import type { ToolDefinition, ToolExecutionResult } from './registry-types.js';
import type { ToolRegistry } from './registry.js';

export interface ProgressiveDisclosureConfig {
  /** Threshold above which progressive disclosure activates (default: 60). */
  threshold?: number;
  /** Maximum results returned by tool_search (default: 10). */
  maxSearchResults?: number;
  /** Context budget fraction target — informational only (default: 0.05). */
  contextBudgetFraction?: number;
}

const DEFAULT_CONFIG: Required<ProgressiveDisclosureConfig> = {
  threshold: 60,
  maxSearchResults: 10,
  contextBudgetFraction: 0.05,
};

/**
 * Determines whether progressive disclosure should be active based on
 * the current number of registered tools.
 */
export function shouldUseProgressiveDisclosure(
  toolCount: number,
  config: ProgressiveDisclosureConfig = {},
): boolean {
  const threshold = config.threshold ?? DEFAULT_CONFIG.threshold;
  return toolCount > threshold;
}

/**
 * Creates the 3 bridge tool definitions that replace the full tool list
 * when progressive disclosure is active. Each bridge tool delegates to
 * the underlying registry.
 */
export function createBridgeTools(
  registry: ToolRegistry,
  config: ProgressiveDisclosureConfig = {},
): ToolDefinition[] {
  const maxResults = config.maxSearchResults ?? DEFAULT_CONFIG.maxSearchResults;

  const toolSearch: ToolDefinition = {
    name: 'tool_search',
    description:
      `Search available tools by keyword. Returns up to ${maxResults} matching tool names and short descriptions. ` +
      `Use tool_describe to get full parameter schema for a specific tool.`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword to search in tool names, descriptions, and tags.',
        },
        limit: {
          type: 'integer',
          description: `Max results to return (default: ${maxResults}).`,
        },
      },
      required: ['query'],
    },
    tags: ['bridge', 'meta'],
    source: 'builtin',
    version: '1.0.0',
    async execute(args: Record<string, unknown>): Promise<string> {
      const query = String(args.query ?? '');
      const limit = Math.min(Number(args.limit) || maxResults, maxResults * 2);
      if (!query.trim()) {
        return JSON.stringify({ error: 'query is required', results: [] });
      }
      const matches = registry.search(query).slice(0, limit);
      const results = matches.map((t) => ({
        name: t.name,
        description: t.description.slice(0, 120),
        tags: t.tags.slice(0, 5),
      }));
      return JSON.stringify({ count: results.length, results });
    },
  };

  const toolDescribe: ToolDefinition = {
    name: 'tool_describe',
    description:
      'Return the full parameter schema and metadata for a specific tool by name. ' +
      'Use after tool_search to inspect a tool before calling it.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Exact tool name to describe.',
        },
      },
      required: ['name'],
    },
    tags: ['bridge', 'meta'],
    source: 'builtin',
    version: '1.0.0',
    async execute(args: Record<string, unknown>): Promise<string> {
      const name = String(args.name ?? '');
      if (!name) {
        return JSON.stringify({ error: 'name is required' });
      }
      const tool = registry.get(name);
      if (!tool) {
        return JSON.stringify({ error: `Tool "${name}" not found` });
      }
      return JSON.stringify({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        tags: tool.tags,
        source: tool.source,
        version: tool.version,
        requiresApproval: tool.requiresApproval ?? false,
        rateLimit: tool.rateLimit ?? null,
      });
    },
  };

  const toolCall: ToolDefinition = {
    name: 'tool_call',
    description:
      'Execute any registered tool by name with the given arguments. ' +
      'This is the universal execution bridge — works for all tools including ' +
      'those hidden by progressive disclosure.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Exact tool name to execute.',
        },
        arguments: {
          type: 'object',
          description: 'Arguments to pass to the tool.',
        },
      },
      required: ['name', 'arguments'],
    },
    tags: ['bridge', 'meta'],
    source: 'builtin',
    version: '1.0.0',
    async execute(args: Record<string, unknown>): Promise<string> {
      const name = String(args.name ?? '');
      const toolArgs = (args.arguments as Record<string, unknown>) ?? {};
      if (!name) {
        return JSON.stringify({ ok: false, error: 'name is required' });
      }
      const result: ToolExecutionResult = await registry.execute(name, toolArgs);
      return JSON.stringify(result);
    },
  };

  return [toolSearch, toolDescribe, toolCall];
}

/**
 * Returns either the full tool definitions or the 3 bridge tools depending
 * on whether progressive disclosure is warranted. This is the main entry
 * point for the AI engine's tool-list resolution.
 */
export function resolveToolsForContext(
  registry: ToolRegistry,
  config: ProgressiveDisclosureConfig = {},
): ToolDefinition[] {
  if (shouldUseProgressiveDisclosure(registry.size, config)) {
    return createBridgeTools(registry, config);
  }
  return registry.definitions();
}

/**
 * Estimate the approximate token cost of a set of tool definitions.
 * Uses character-length heuristic (~4 chars/token) suitable for
 * comparing relative costs.
 */
export function estimateToolDefinitionsTokens(tools: ToolDefinition[]): number {
  let chars = 0;
  for (const t of tools) {
    // Name + description + JSON schema serialization
    chars += t.name.length + 2;
    chars += t.description.length + 4;
    chars += JSON.stringify(t.parameters).length + 8;
  }
  return Math.ceil(chars / 4);
}
