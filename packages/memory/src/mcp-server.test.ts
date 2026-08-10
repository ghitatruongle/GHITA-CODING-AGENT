import { describe, it, expect } from 'vitest';
import { createLinkedPair } from '@ghita/mcp';
import { createMCPClient } from '@ghita/mcp';
import { createMemoryMCPServer, type MemoryLike } from './mcp-server.js';

const stubMemory: MemoryLike = {
  remember: (input) => ({ id: 'mem_1', ...input }),
  search: (query) => [{ id: 'mem_1', content: query }],
};

describe('createMemoryMCPServer', () => {
  it('exposes memory.search and denies writes by default', async () => {
    const [clientTransport, serverTransport] = createLinkedPair();
    const server = createMemoryMCPServer({ memory: stubMemory });
    await server.connect(serverTransport);

    const client = createMCPClient('c', { kind: 'in-memory', transport: clientTransport });
    await client.connect();

    const names = client.tools.map((t) => t.name);
    expect(names).toContain('memory.search');
    expect(names).toContain('memory.remember');

    const ok = await client.callTool('memory.search', { query: 'hi' });
    expect(ok.isError).toBe(false);

    const denied = await client.callTool('memory.remember', { type: 'fact', content: 'x' });
    expect(denied.isError).toBe(true);
    expect(denied.content[0]?.text).toContain('denied by default');

    await client.close();
  });

  it('allows writes when allowWrite is set', async () => {
    const [clientTransport, serverTransport] = createLinkedPair();
    const server = createMemoryMCPServer({ memory: stubMemory, allowWrite: true });
    await server.connect(serverTransport);
    const client = createMCPClient('c', { kind: 'in-memory', transport: clientTransport });
    await client.connect();

    const res = await client.callTool('memory.remember', { type: 'fact', content: 'hello' });
    expect(res.isError).toBe(false);
    expect(res.content[0]?.text).toContain('mem_1');

    await client.close();
  });
});
