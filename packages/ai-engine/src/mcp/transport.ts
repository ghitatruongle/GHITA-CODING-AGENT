// ==============================================================================
// GHITA CODING AGENT - MCP Transport Layer
// ==============================================================================

import type { MCPServerConfig } from './types.js';
import { spawn } from 'node:child_process';
import * as readline from 'node:readline';

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
  private process: ReturnType<typeof spawn> | undefined;
  private rl?: readline.Interface;
  private pendingRequests = new Map<
    number,
    { resolve: (res: Record<string, unknown>) => void; reject: (err: Error) => void }
  >();

  constructor(private config: MCPServerConfig) {}

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`MCP server "${this.config.name}": command is required for stdio transport`);
    }

    // Quote arguments containing spaces or backslashes for Windows compatibility
    const args = (this.config.args ?? []).map((arg) => {
      if (process.platform === 'win32' && (arg.includes(' ') || arg.includes('\\'))) {
        return `"${arg.replace(/"/g, '""')}"`;
      }
      return arg;
    });

    this.process = spawn(this.config.command, args, {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true, // Prevent console window flash on Windows
    }) as ReturnType<typeof spawn>;

    (this.process as unknown as NodeJS.EventEmitter).on('error', (err: Error) => {
      this.disconnect();
      for (const req of this.pendingRequests.values()) req.reject(err);
      this.pendingRequests.clear();
    });

    (this.process as unknown as NodeJS.EventEmitter).on('exit', () => {
      this.disconnect();
      const err = new Error(`MCP server "${this.config.name}" process exited unexpectedly`);
      for (const req of this.pendingRequests.values()) req.reject(err);
      this.pendingRequests.clear();
    });

    if (this.process.stdout) {
      this.rl = readline.createInterface({ input: this.process.stdout });
      (this.rl as unknown as NodeJS.EventEmitter).on('line', (line: string) => {
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          // Support both numeric and string JSON-RPC IDs
          if (
            message.id !== undefined &&
            (typeof message.id === 'number' || typeof message.id === 'string')
          ) {
            const req = this.pendingRequests.get(message.id as number);
            if (req) {
              this.pendingRequests.delete(message.id as number);
              if (message.error) {
                req.reject(new Error(JSON.stringify(message.error)));
              } else {
                req.resolve(message);
              }
            }
          }
        } catch (e) {
          // Ignore parse errors (might be debug output)
        }
      });
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  async send(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const stdin = this.process?.stdin;
    if (!this.connected || !stdin) {
      throw new Error(`MCP server "${this.config.name}" is not connected`);
    }
    const id = ++this.requestId;
    const jsonRpc = { jsonrpc: '2.0', id, ...request };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      stdin.write(`${JSON.stringify(jsonRpc)}\n`, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
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
