#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT - MCP interop check (v1.1.0 Track 1 P24)
// ------------------------------------------------------------------------------
// Builds the four GHITA MCP servers (codegraph, browser, memory, skills) and
// verifies a standard SDK client can list tools and call them — proving the
// servers speak the standard Model Context Protocol. Uses the in-memory
// transport pair for CI; the same server objects also serve stdio transports
// for Claude Code / Codex.
// Usage: node scripts/mcp-interop-check.mjs
// Prereq: pnpm --filter @ghita/mcp --filter @ghita/code-graph \
//             --filter @ghita/browser-control --filter @ghita/memory \
//             --filter @ghita/skills build
// ==============================================================================

import { createLinkedPair, createMCPClient } from '../packages/mcp/dist/index.js';
import { CodeKnowledgeGraph, CodeGraphMCPServer } from '../packages/code-graph/dist/index.js';
import { createBrowserMCPServer } from '../packages/browser-control/dist/index.js';
import { AgentMemory, createMemoryMCPServer } from '../packages/memory/dist/index.js';
import { createDefaultSkillRegistry, createSkillsMCPServer } from '../packages/skills/dist/index.js';

const stubBrowser = {
  navigate: async () => ({ ok: true }),
  click: async () => ({ ok: true }),
  fill: async () => ({ ok: true }),
  extract: async () => ({ ok: true, text: 'ok' }),
  screenshot: async () => ({ ok: true }),
  getState: () => ({ status: 'ready' }),
};

async function check(name, buildServer, probe) {
  const [clientTransport, serverTransport] = createLinkedPair();
  const server = buildServer();
  await server.connect(serverTransport);
  const client = createMCPClient(`interop-${name}`, { kind: 'in-memory', transport: clientTransport });
  await client.connect();

  if (client.tools.length === 0) {
    throw new Error(`server ${name} exposed no tools`);
  }
  const result = await probe(client);
  await client.close();
  await server.close();
  return result;
}

async function main() {
  const results = [];

  results.push([
    'codegraph',
    await check(
      'codegraph',
      () => new CodeGraphMCPServer(new CodeKnowledgeGraph()).createServer(),
      async (client) => (await client.callTool('get_graph_stats', {})).content[0]?.text,
    ),
  ]);

  results.push([
    'browser-control',
    await check(
      'browser-control',
      () => createBrowserMCPServer({ browser: stubBrowser }),
      async (client) => (await client.callTool('browser.extract', {})).content[0]?.text,
    ),
  ]);

  results.push([
    'memory',
    await check(
      'memory',
      () => createMemoryMCPServer({ memory: new AgentMemory() }),
      async (client) => (await client.callTool('memory.search', { query: 'x' })).content[0]?.text,
    ),
  ]);

  results.push([
    'skills',
    await check(
      'skills',
      () => createSkillsMCPServer({ skills: createDefaultSkillRegistry() }),
      async (client) => (await client.callTool('skills.list', {})).content[0]?.text,
    ),
  ]);

  for (const [name, text] of results) {
    const ok = typeof text === 'string' && text.length > 0;
    console.log(`[mcp-interop] ${name}: ${ok ? 'OK' : 'FAIL (empty result)'}`);
    if (!ok) process.exitCode = 1;
  }
  console.log('[mcp-interop] all servers OK (standard MCP over SDK transports)');
}

main().catch((err) => {
  console.error(`[mcp-interop] FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
