// ==============================================================================
// GHITA CODING AGENT - @ghita/mcp client (official SDK transports)
// ==============================================================================

import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { MCPClientConfig } from './types.js';

/** Normalized remote tool description. */
export interface RemoteTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Normalized call result (text content blocks). */
export interface CallToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

function createTransport(config: MCPClientConfig): Transport {
  switch (config.kind) {
    case 'stdio':
      return new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        cwd: config.cwd,
      });
    case 'sse':
      return new SSEClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers },
      });
    case 'http':
      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers },
      });
    case 'in-memory':
      return config.transport as unknown as Transport;
    default:
      throw new Error(`unsupported MCP client transport kind`);
  }
}

/** Client wrapper over the official @modelcontextprotocol SDK. */
export class MCPClient {
  private readonly sdkClient: McpClient;
  private readonly transport: Transport;
  private toolsCache: RemoteTool[] = [];
  connected = false;

  constructor(
    readonly name: string,
    config: MCPClientConfig,
  ) {
    this.transport = createTransport(config);
    this.sdkClient = new McpClient({
      name,
      version: '1.1.0',
    });
  }

  async connect(): Promise<void> {
    await this.sdkClient.connect(this.transport);
    this.connected = true;
    await this.refreshTools();
  }

  async refreshTools(): Promise<RemoteTool[]> {
    const result = await this.sdkClient.listTools();
    this.toolsCache = result.tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
    return this.toolsCache;
  }

  get tools(): readonly RemoteTool[] {
    return this.toolsCache;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResponse> {
    const raw = (await this.sdkClient.callTool({ name, arguments: args })) as {
      content?: unknown;
      isError?: unknown;
    };
    const rawContent = Array.isArray(raw.content) ? raw.content : [];
    const content: Array<{ type: 'text'; text: string }> = rawContent
      .filter(
        (b): b is { type: string; text: unknown } =>
          typeof b === 'object' && b !== null && 'text' in b,
      )
      .filter((b) => typeof b.text === 'string')
      .map((b) => ({ type: 'text' as const, text: b.text as string }));
    return { content, isError: Boolean(raw.isError) };
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.sdkClient.close().catch(() => undefined);
    }
    this.connected = false;
  }
}

export function createMCPClient(name: string, config: MCPClientConfig): MCPClient {
  return new MCPClient(name, config);
}
