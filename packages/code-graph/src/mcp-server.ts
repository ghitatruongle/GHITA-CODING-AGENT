// ==============================================================================
// GHITA CODING AGENT - CodeGraph MCP (Model Context Protocol) Server Protocol
// ==============================================================================
// Exposes CodeKnowledgeGraph operations via standard MCP tool JSON-RPC payloads.
// ==============================================================================

import type { CodeKnowledgeGraph } from './index.js';
import type { SearchQuery } from './types.js';

export interface MCPToolCallRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

export interface MCPToolCallResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
  };
}

export class CodeGraphMCPServer {
  constructor(private readonly codeGraph: CodeKnowledgeGraph) {}

  /**
   * Return the list of available MCP tools exposed by CodeGraph.
   */
  listTools() {
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
            limit: { type: 'number', description: 'Max results' },
          },
          required: ['pattern'],
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
      },
      {
        name: 'get_graph_stats',
        description: 'Get total indexed files, nodes, and edges statistics',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  /**
   * Handle incoming MCP JSON-RPC tool call payload.
   */
  handleMessage(request: MCPToolCallRequest): MCPToolCallResponse {
    if (request.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ tools: this.listTools() }, null, 2),
            },
          ],
        },
      };
    }

    if (request.method === 'tools/call' && request.params) {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      if (toolName === 'search_code_symbols') {
        const query: SearchQuery = {
          pattern: String(args.pattern || ''),
          scope: args.scope as SearchQuery['scope'],
          limit: typeof args.limit === 'number' ? args.limit : 20,
        };
        const results = this.codeGraph.search(query);
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
          },
        };
      }

      if (toolName === 'get_symbol_dependencies') {
        const symbolId = String(args.symbolId || '');
        const deps = this.codeGraph.getDependencies(symbolId);
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(deps, null, 2) }],
          },
        };
      }

      if (toolName === 'get_graph_stats') {
        const stats = this.codeGraph.stats();
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `Tool not found: ${toolName}` },
      };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32601, message: `Method not found: ${request.method}` },
    };
  }
}
