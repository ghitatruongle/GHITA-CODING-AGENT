// ==============================================================================
// GHITA CODING AGENT - Browser-Control MCP Server (standard @ghita/mcp)
// ==============================================================================

import { createMCPServer, type GhitaMCPServer, type ToolDefinition } from '@ghita/mcp';

/** Structural surface of BrowserController used by the server. */
export interface BrowserLike {
  navigate(url: string): Promise<{ ok?: boolean; error?: string }>;
  click(selector: string): Promise<{ ok?: boolean; error?: string }>;
  fill(selector: string, value: string): Promise<{ ok?: boolean; error?: string }>;
  extract(selector?: string): Promise<{ ok?: boolean; error?: string }>;
  screenshot(): Promise<{ ok?: boolean; error?: string }>;
  getState(): { status: string };
}

export interface BrowserMCPServerConfig {
  browser: BrowserLike;
  /** If set, navigation is restricted to these hosts (deny-default). */
  allowedHosts?: string[];
}

export class BrowserMCPServer {
  constructor(private readonly config: BrowserMCPServerConfig) {}

  listTools(): ToolDefinition[] {
    return [
      {
        name: 'browser.open',
        description: 'Navigate the browser to a URL (host allowlisted when configured)',
        inputSchema: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url'],
        },
        handler: async (args) => {
          const res = await this.config.browser.navigate(String(args.url ?? ''));
          return { content: [{ type: 'text', text: fmt(res) }], isError: res.ok === false };
        },
      },
      {
        name: 'browser.click',
        description: 'Click an element by CSS selector',
        inputSchema: {
          type: 'object',
          properties: { selector: { type: 'string' } },
          required: ['selector'],
        },
        handler: async (args) => {
          const res = await this.config.browser.click(String(args.selector ?? ''));
          return { content: [{ type: 'text', text: fmt(res) }], isError: res.ok === false };
        },
      },
      {
        name: 'browser.fill',
        description: 'Fill a form field by CSS selector',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['selector', 'value'],
        },
        handler: async (args) => {
          const res = await this.config.browser.fill(
            String(args.selector ?? ''),
            String(args.value ?? ''),
          );
          return { content: [{ type: 'text', text: fmt(res) }], isError: res.ok === false };
        },
      },
      {
        name: 'browser.extract',
        description: 'Extract text from the page or a selector',
        inputSchema: {
          type: 'object',
          properties: { selector: { type: 'string', description: 'Optional CSS selector' } },
        },
        handler: async (args) => {
          const sel = typeof args.selector === 'string' ? args.selector : undefined;
          const res = await this.config.browser.extract(sel);
          return { content: [{ type: 'text', text: fmt(res) }], isError: res.ok === false };
        },
      },
    ];
  }

  createServer(): GhitaMCPServer {
    const tools = this.listTools();
    const nav = tools.find((t) => t.name === 'browser.open');
    if (nav) {
      // Deferred: navigation needs a browser launch; hook guard on allowlist.
    }
    return createMCPServer({
      name: 'ghita-browser',
      version: '1.0.0',
      tools,
      hooks: {
        preToolCall: (name, args) => {
          if (name === 'browser.open') {
            const url = String(args.url ?? '');
            const hosts = this.config.allowedHosts;
            if (hosts && hosts.length > 0) {
              let host: string;
              try {
                host = new URL(url).hostname;
              } catch {
                return `invalid URL: ${url}`;
              }
              if (!hosts.includes(host)) return `host "${host}" not in allowed hosts`;
            }
          }
          return undefined;
        },
      },
    });
  }
}

export function createBrowserMCPServer(config: BrowserMCPServerConfig): GhitaMCPServer {
  return new BrowserMCPServer(config).createServer();
}

function fmt(res: { ok?: boolean; error?: string; text?: unknown; value?: unknown }): string {
  if (res.ok === false) return `error: ${res.error ?? 'unknown'}`;
  return JSON.stringify(res);
}
