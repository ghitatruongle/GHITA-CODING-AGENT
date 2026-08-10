import { describe, it, expect } from 'vitest';
import { createLinkedPair } from '@ghita/mcp';
import { createMCPClient } from '@ghita/mcp';
import { createBrowserMCPServer, type BrowserLike } from './mcp-server.js';

const stubBrowser: BrowserLike = {
  navigate: async () => ({ ok: true }),
  click: async () => ({ ok: true }),
  fill: async () => ({ ok: true }),
  extract: async () => ({ ok: true, text: 'page text' }),
  screenshot: async () => ({ ok: true }),
  getState: () => ({ status: 'ready' }),
};

describe('createBrowserMCPServer', () => {
  it('exposes browser tools and calls extract', async () => {
    const [clientTransport, serverTransport] = createLinkedPair();
    const server = createBrowserMCPServer({ browser: stubBrowser });
    await server.connect(serverTransport);
    const client = createMCPClient('c', { kind: 'in-memory', transport: clientTransport });
    await client.connect();

    expect(client.tools.map((t) => t.name)).toEqual([
      'browser.open',
      'browser.click',
      'browser.fill',
      'browser.extract',
    ]);

    const res = await client.callTool('browser.extract', {});
    expect(res.isError).toBe(false);
    expect(res.content[0]?.text).toContain('page text');

    await client.close();
  });

  it('denies navigation to non-allowlisted hosts', async () => {
    const [clientTransport, serverTransport] = createLinkedPair();
    const server = createBrowserMCPServer({
      browser: stubBrowser,
      allowedHosts: ['example.com'],
    });
    await server.connect(serverTransport);
    const client = createMCPClient('c', { kind: 'in-memory', transport: clientTransport });
    await client.connect();

    const ok = await client.callTool('browser.open', { url: 'https://example.com/x' });
    expect(ok.isError).toBe(false);

    const denied = await client.callTool('browser.open', { url: 'https://evil.org/x' });
    expect(denied.isError).toBe(true);
    expect(denied.content[0]?.text).toContain('not in allowed hosts');

    await client.close();
  });
});
