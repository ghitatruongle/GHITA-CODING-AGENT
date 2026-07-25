// ==============================================================================
// CodeGraph MCP Server Unit Tests
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { CodeKnowledgeGraph } from './index.js';
import { CodeGraphMCPServer } from './mcp-server.js';

describe('CodeGraphMCPServer', () => {
  it('should list available MCP tools', () => {
    const kg = new CodeKnowledgeGraph();
    const mcpServer = new CodeGraphMCPServer(kg);

    const tools = mcpServer.listTools();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toContain('search_code_symbols');
    expect(tools.map((t) => t.name)).toContain('get_symbol_dependencies');
    expect(tools.map((t) => t.name)).toContain('get_graph_stats');
  });

  it('should handle tools/list RPC request', () => {
    const kg = new CodeKnowledgeGraph();
    const mcpServer = new CodeGraphMCPServer(kg);

    const response = mcpServer.handleMessage({
      jsonrpc: '2.0',
      id: 'req-1',
      method: 'tools/list',
    });

    expect(response.id).toBe('req-1');
    expect(response.result?.content[0]?.text).toContain('search_code_symbols');
  });

  it('should handle tools/call RPC request for get_graph_stats', () => {
    const kg = new CodeKnowledgeGraph();
    const mcpServer = new CodeGraphMCPServer(kg);

    const response = mcpServer.handleMessage({
      jsonrpc: '2.0',
      id: 'req-2',
      method: 'tools/call',
      params: {
        name: 'get_graph_stats',
      },
    });

    expect(response.result).toBeDefined();
    expect(response.result?.content[0]?.text).toContain('nodes');
  });
});
