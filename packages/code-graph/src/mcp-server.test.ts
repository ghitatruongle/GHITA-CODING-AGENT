// ==============================================================================
// CodeGraph MCP Server Unit Tests (standard @ghita/mcp + official SDK)
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { createLinkedPair, createMCPClient } from '@ghita/mcp';
import { CodeKnowledgeGraph } from './index.js';
import { CodeGraphMCPServer } from './mcp-server.js';

describe('CodeGraphMCPServer', () => {
  it('lists the three standard tools', () => {
    const kg = new CodeKnowledgeGraph();
    const mcpServer = new CodeGraphMCPServer(kg);

    const tools = mcpServer.listTools();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toContain('search_code_symbols');
    expect(tools.map((t) => t.name)).toContain('get_symbol_dependencies');
    expect(tools.map((t) => t.name)).toContain('get_graph_stats');
  });

  it('serves tools via a standard MCP session (in-memory transport)', async () => {
    const kg = new CodeKnowledgeGraph();
    const mcpServer = new CodeGraphMCPServer(kg);

    const [clientTransport, serverTransport] = createLinkedPair();
    await mcpServer.createServer().connect(serverTransport);

    const client = createMCPClient('test-client', {
      kind: 'in-memory',
      transport: clientTransport,
    });
    await client.connect();

    const names = client.tools.map((t) => t.name);
    expect(names).toEqual(['search_code_symbols', 'get_symbol_dependencies', 'get_graph_stats']);

    const stats = await client.callTool('get_graph_stats', {});
    expect(stats.isError).toBe(false);
    expect(stats.content[0]?.text).toContain('nodes');

    await client.close();
  });

  it('calls search_code_symbols with a pattern on an empty graph', async () => {
    const kg = new CodeKnowledgeGraph();
    const mcpServer = new CodeGraphMCPServer(kg);

    const [clientTransport, serverTransport] = createLinkedPair();
    await mcpServer.createServer().connect(serverTransport);

    const client = createMCPClient('test-client', {
      kind: 'in-memory',
      transport: clientTransport,
    });
    await client.connect();

    const res = await client.callTool('search_code_symbols', { pattern: 'foo' });
    // Empty graph either returns an empty result set or a graceful error text.
    expect(res.content[0]?.text).toBeDefined();

    await client.close();
  });
});
