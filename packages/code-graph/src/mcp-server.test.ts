// CodeGraph MCP Server Unit Tests (standard @ghita/mcp + official SDK)

import { describe, it, expect } from 'vitest';
import { createLinkedPair, createMCPClient } from '@ghita/mcp';
import { CodeKnowledgeGraph } from './index.js';
import { CodeGraphMCPServer } from './mcp-server.js';

describe('CodeGraphMCPServer', () => {
  it('lists the standard tools including Track 3 tools', () => {
    const kg = new CodeKnowledgeGraph();
    const mcpServer = new CodeGraphMCPServer(kg);

    const tools = mcpServer.listTools();
    expect(tools).toHaveLength(8);
    const names = tools.map((t) => t.name);
    expect(names).toContain('codegraph_callers');
    expect(names).toContain('codegraph_callees');
    expect(names).toContain('codegraph_impact');
    expect(names).toContain('codegraph_explore');
    expect(names).toContain('codegraph_status');
    expect(names).toContain('search_code_symbols');
    expect(names).toContain('get_symbol_dependencies');
    expect(names).toContain('get_graph_stats');
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
    expect(names).toContain('codegraph_callers');
    expect(names).toContain('codegraph_impact');
    expect(names).toContain('codegraph_explore');
    expect(names).toContain('codegraph_status');

    const stats = await client.callTool('codegraph_status', {});
    expect(stats.isError).toBe(false);
    expect(stats.content[0]?.text).toContain('nodesCount');

    await client.close();
  });

  it('executes codegraph_callers and codegraph_impact over MCP', async () => {
    const kg = new CodeKnowledgeGraph();
    const g = kg.getGraph();

    // Populate graph with test nodes
    g.addNodes([
      {
        id: 'fileA.ts::helperFunc',
        name: 'helperFunc',
        qualifiedName: 'helperFunc',
        kind: 'function',
        filePath: '/src/fileA.ts',
        startLine: 10,
        endLine: 20,
        excerpt: 'function helperFunc() {}',
        exported: true,
        tags: [],
        indexedAt: Date.now(),
      },
      {
        id: 'fileB.ts::mainFunc',
        name: 'mainFunc',
        qualifiedName: 'mainFunc',
        kind: 'function',
        filePath: '/src/fileB.ts',
        startLine: 5,
        endLine: 15,
        excerpt: 'function mainFunc() { helperFunc(); }',
        exported: true,
        tags: [],
        indexedAt: Date.now(),
      },
    ]);

    g.addEdge({
      from: 'fileB.ts::mainFunc',
      to: 'fileA.ts::helperFunc',
      kind: 'call',
      weight: 1.0,
      line: 8,
    });

    const mcpServer = new CodeGraphMCPServer(kg);
    const [clientTransport, serverTransport] = createLinkedPair();
    await mcpServer.createServer().connect(serverTransport);

    const client = createMCPClient('test-client', {
      kind: 'in-memory',
      transport: clientTransport,
    });
    await client.connect();

    // 1. Test callers
    const callersRes = await client.callTool('codegraph_callers', { symbol: 'helperFunc' });
    expect(callersRes.isError).toBe(false);
    const callersData = JSON.parse(callersRes.content[0]?.text ?? '{}');
    expect(callersData.count).toBe(1);
    expect(callersData.callers[0].name).toBe('mainFunc');

    // 2. Test impact
    const impactRes = await client.callTool('codegraph_impact', { symbol: 'helperFunc' });
    expect(impactRes.isError).toBe(false);
    const impactData = JSON.parse(impactRes.content[0]?.text ?? '{}');
    expect(impactData.impactedFiles).toContain('/src/fileB.ts');
    expect(impactData.riskScore).toBeGreaterThan(0);

    // 3. Test explore
    const exploreRes = await client.callTool('codegraph_explore', { target: 'helperFunc' });
    expect(exploreRes.isError).toBe(false);
    const exploreData = JSON.parse(exploreRes.content[0]?.text ?? '{}');
    expect(exploreData.nodesCount).toBe(2);

    await client.close();
  });
});
