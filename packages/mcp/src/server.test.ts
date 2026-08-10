import { describe, it, expect } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMCPServer } from './server.js';
import { createMCPClient } from './client.js';
import type { ToolDefinition } from './types.js';

const echo: ToolDefinition = {
  name: 'echo',
  description: 'Return the given text',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  handler: async (args) => ({
    content: [{ type: 'text', text: `echo: ${String(args.text)}` }],
  }),
};

const secretTool: ToolDefinition = {
  name: 'read_secret',
  description: 'Reads a secret (denied by default)',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => ({ content: [{ type: 'text', text: 'secret' }] }),
};

function linkedPair() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  return { clientTransport, serverTransport };
}

describe('GhitaMCPServer + MCPClient (in-memory)', () => {
  it('lists tools and calls echo', async () => {
    const pair = linkedPair();
    const server = createMCPServer({ name: 'test', version: '1.0.0', tools: [echo] });
    await server.connect(pair.serverTransport);

    const client = createMCPClient('test-client', {
      kind: 'in-memory',
      transport: pair.clientTransport,
    });
    await client.connect();

    expect(client.tools.map((t) => t.name)).toEqual(['echo']);
    const res = await client.callTool('echo', { text: 'hi' });
    expect(res.isError).toBe(false);
    expect(res.content[0]?.text).toBe('echo: hi');

    await client.close();
    await server.close();
  });

  it('deny-default via preToolCall hook', async () => {
    const pair = linkedPair();
    const server = createMCPServer({
      name: 'guarded',
      version: '1.0.0',
      tools: [echo, secretTool],
      hooks: {
        preToolCall: (name) =>
          name === 'read_secret' ? 'secret access is denied by default' : undefined,
      },
    });
    await server.connect(pair.serverTransport);
    const client = createMCPClient('client', {
      kind: 'in-memory',
      transport: pair.clientTransport,
    });
    await client.connect();

    const ok = await client.callTool('echo', { text: 'x' });
    expect(ok.isError).toBe(false);

    const denied = await client.callTool('read_secret', {});
    expect(denied.isError).toBe(true);
    expect(denied.content[0]?.text).toContain('denied by policy');

    await client.close();
    await server.close();
  });

  it('surfaces handler errors as isError', async () => {
    const boom: ToolDefinition = {
      name: 'boom',
      description: 'throws',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        throw new Error('kaboom');
      },
    };
    const server = createMCPServer({ name: 't', version: '1.0.0', tools: [boom] });
    const pair = linkedPair();
    await server.connect(pair.serverTransport);
    const client = createMCPClient('c', { kind: 'in-memory', transport: pair.clientTransport });
    await client.connect();
    const res = await client.callTool('boom', {});
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain('kaboom');
    await client.close();
    await server.close();
  });
});
