// ==============================================================================
// GHITA CODING AGENT - CodeGraph MCP Server (standard @ghita/mcp + official SDK)
// ==============================================================================
// Exposes CodeKnowledgeGraph operations as standard MCP tools. Built on
// @ghita/mcp (official @modelcontextprotocol SDK) — the previous hand-written
// JSON-RPC protocol was removed (v1.1.0 Track 1 P19/P23).
// ==============================================================================

import { createMCPServer, type GhitaMCPServer, type ToolDefinition } from '@ghita/mcp';
import type { CodeKnowledgeGraph } from './index.js';
import type { SearchQuery } from './types.js';

export class CodeGraphMCPServer {
  constructor(private readonly codeGraph: CodeKnowledgeGraph) {}

  /** The three standard tools exposed by CodeGraph. */
  listTools(): ToolDefinition[] {
    return [
      {
        name: 'search_code_symbols',
        description: 'Search symbols (functions, classes, variables) in the indexed AST code graph',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Symbol pattern or search query' },
            scope: {
              type: 'string',
              description: 'Node kind filter: function, class, variable, module, interface',
            },
            limit: { type: 'number', description: 'Max results (default 20)' },
          },
          required: ['pattern'],
        },
        handler: async (args) => {
          try {
            const query: SearchQuery = {
              pattern: String(args.pattern ?? ''),
              scope: args.scope as SearchQuery['scope'],
              limit: typeof args.limit === 'number' ? args.limit : 20,
            };
            const results = this.codeGraph.search(query);
            return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
          } catch (err) {
            return {
              content: [
                {
                  type: 'text',
                  text: `search error: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              isError: true,
            };
          }
        },
      },
      {
        name: 'get_symbol_dependencies',
        description: 'Get all dependencies (imported/referenced symbols) of a given symbol ID',
        inputSchema: {
          type: 'object',
          properties: {
            symbolId: { type: 'string', description: 'Node ID in the AST graph' },
          },
          required: ['symbolId'],
        },
        handler: async (args) => {
          const deps = this.codeGraph.getDependencies(String(args.symbolId ?? ''));
          return { content: [{ type: 'text', text: JSON.stringify(deps, null, 2) }] };
        },
      },
      {
        name: 'get_graph_stats',
        description: 'Get total indexed files, nodes, and edges statistics',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const stats = this.codeGraph.stats();
          return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
        },
      },
    ];
  }

  /** Build a standard @ghita/mcp server exposing the code-graph tools. */
  createServer(): GhitaMCPServer {
    return createMCPServer({
      name: 'ghita-codegraph',
      version: '1.0.0',
      tools: this.listTools(),
    });
  }
}
