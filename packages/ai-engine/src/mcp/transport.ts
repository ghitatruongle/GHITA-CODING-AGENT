// ==============================================================================
// GHITA CODING AGENT - MCP Transport Layer
// ==============================================================================

import type { MCPServerConfig } from './types.js';

export interface MCPTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(request: Record<string, unknown>): Promise<Record<string, unknown>>;
  isConnected(): boolean;
}

/**
 * Stdio transport — spawn process, communicate via stdin/stdout JSON-RPC
 */
export class StdioTransport implements MCPTransport {
  private connected = false;
  private requestId = 0;

  constructor(private config: MCPServerConfig) {}

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`MCP server "${this.config.name}": command is required for stdio transport`);
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async send(_request: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.connected) {
      throw new Error(`MCP server "${this.config.name}" is not connected`);
    }
    const id = ++this.requestId;
    // In real implementation, this would write to stdin and read from stdout
    // For now, return a mock response structure
    return { jsonrpc: '2.0', id, result: {} };
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * SSE transport — connect to HTTP SSE endpoint
 */
export class SSETransport implements MCPTransport {
  private connected = false;
  private requestId = 0;

  constructor(private config: MCPServerConfig) {}

  async connect(): Promise<void> {
    if (!this.config.url) {
      throw new Error(`MCP server "${this.config.name}": url is required for SSE transport`);
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async send(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.connected) {
      throw new Error(`MCP server "${this.config.name}" is not connected`);
    }
    if (!this.config.url) {
      throw new Error(`MCP server "${this.config.name}": url not configured`);
    }
    const id = ++this.requestId;
    const jsonRpc = { jsonrpc: '2.0', id, ...request };

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonRpc),
    });

    if (!response.ok) {
      throw new Error(`MCP server "${this.config.name}" returned ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/** Factory tạo transport từ config */
export function createTransport(config: MCPServerConfig): MCPTransport {
  switch (config.transport) {
    case 'stdio':
      return new StdioTransport(config);
    case 'sse':
      return new SSETransport(config);
    default:
      throw new Error(`Unknown MCP transport type: ${config.transport}`);
  }
}
