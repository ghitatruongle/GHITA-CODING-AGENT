// Exposes CodeKnowledgeGraph operations as standard MCP tools. Built on
// @ghita/mcp (official @modelcontextprotocol SDK) — the previous hand-written

import { createMCPServer, type GhitaMCPServer, type ToolDefinition } from '@ghita/mcp';
import type { CodeKnowledgeGraph } from './index.js';
import type { SearchQuery } from './types.js';

export class CodeGraphMCPServer {
  constructor(private readonly codeGraph: CodeKnowledgeGraph) {}

  /** The standard tools exposed by CodeGraph MCP server. */
  listTools(): ToolDefinition[] {
    return [
      
      {
        name: 'codegraph_callers',
        description:
          'Find all functions, methods, or modules that call or reference a given symbol',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description:
                'Symbol name, qualified name, or node ID (e.g. "handleClick", "AuthService.login")',
            },
          },
          required: ['symbol'],
        },
        handler: async (args) => {
          try {
            const symbol = String(args.symbol ?? '');
            const callers = this.codeGraph.getCallers(symbol);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      symbol,
                      count: callers.length,
                      callers: callers.map((c) => ({
                        id: c.id,
                        name: c.name,
                        qualifiedName: c.qualifiedName,
                        kind: c.kind,
                        filePath: c.filePath,
                        line: c.startLine,
                        excerpt: c.excerpt,
                      })),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (err) {
            return {
              content: [
                {
                  type: 'text',
                  text: `codegraph_callers error: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              isError: true,
            };
          }
        },
      },

      {
        name: 'codegraph_callees',
        description:
          'Find all functions, methods, or symbols called or referenced by a given symbol',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Symbol name, qualified name, or node ID (e.g. "handleSubmit")',
            },
          },
          required: ['symbol'],
        },
        handler: async (args) => {
          try {
            const symbol = String(args.symbol ?? '');
            const callees = this.codeGraph.getCallees(symbol);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      symbol,
                      count: callees.length,
                      callees: callees.map((c) => ({
                        id: c.id,
                        name: c.name,
                        qualifiedName: c.qualifiedName,
                        kind: c.kind,
                        filePath: c.filePath,
                        line: c.startLine,
                        excerpt: c.excerpt,
                      })),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (err) {
            return {
              content: [
                {
                  type: 'text',
                  text: `codegraph_callees error: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              isError: true,
            };
          }
        },
      },

      {
        name: 'codegraph_impact',
        description:
          'Analyze blast-radius and impacted files/symbols if a given symbol or function is modified',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Symbol name, qualified name, or node ID to analyze impact for',
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum reverse-dependency traversal depth (default: 3)',
            },
          },
          required: ['symbol'],
        },
        handler: async (args) => {
          try {
            const symbol = String(args.symbol ?? '');
            const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : 3;
            const impact = this.codeGraph.getImpact(symbol, maxDepth);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      target: impact.target,
                      riskScore: impact.riskScore,
                      impactedFilesCount: impact.impactedFiles.length,
                      impactedFiles: impact.impactedFiles,
                      impactedNodesCount: impact.impactedNodes.length,
                      impactedNodes: impact.impactedNodes.map((n) => ({
                        id: n.id,
                        name: n.name,
                        qualifiedName: n.qualifiedName,
                        kind: n.kind,
                        filePath: n.filePath,
                        startLine: n.startLine,
                      })),
                      samplePaths: impact.paths,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (err) {
            return {
              content: [
                {
                  type: 'text',
                  text: `codegraph_impact error: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              isError: true,
            };
          }
        },
      },

      {
        name: 'codegraph_explore',
        description: 'Explore the neighborhood subgraph around a specific symbol or file',
        inputSchema: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              description: 'Symbol name, qualified name, node ID, or file path prefix',
            },
            depth: {
              type: 'number',
              description: 'Hop depth for neighborhood traversal (default: 1)',
            },
          },
          required: ['target'],
        },
        handler: async (args) => {
          try {
            const target = String(args.target ?? '');
            const depth = typeof args.depth === 'number' ? args.depth : 1;
            const result = this.codeGraph.explore(target, { depth });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      center: result.center,
                      nodesCount: result.nodes.length,
                      edgesCount: result.edges.length,
                      inwardCount: result.inwardCount,
                      outwardCount: result.outwardCount,
                      nodes: result.nodes.map((n) => ({
                        id: n.id,
                        name: n.name,
                        kind: n.kind,
                        filePath: n.filePath,
                        startLine: n.startLine,
                      })),
                      edges: result.edges,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (err) {
            return {
              content: [
                {
                  type: 'text',
                  text: `codegraph_explore error: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              isError: true,
            };
          }
        },
      },

      {
        name: 'codegraph_status',
        description:
          'Get comprehensive status of the code graph including node kinds, edge counts, and persistence',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const status = this.codeGraph.statusDetailed();
          return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
        },
      },

      // Existing tools (backward compatibility)
      
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
      version: '1.1.5-beta1',
      tools: this.listTools(),
    });
  }
}
