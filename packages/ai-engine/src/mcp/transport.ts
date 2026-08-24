import type { MCPServerConfig } from './types.js';
import { spawn } from 'node:child_process';
import * as readline from 'node:readline';

// the promise rejects and the pending entry is cleaned up. Without a timeout a
// silent MCP server would hang the agent loop forever.
const MCP_REQUEST_TIMEOUT_MS = 30_000;

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
  // Keyed by String(id): JSON-RPC ids may be numbers OR strings depending on
  // the server implementation.
  private pendingRequests = new Map<
    string,
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
            const req = this.pendingRequests.get(String(message.id));
            if (req) {
              this.pendingRequests.delete(String(message.id));
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
    const pendingKey = String(id);

    return new Promise((resolve, reject) => {
      
      const timer = setTimeout(() => {
        this.pendingRequests.delete(pendingKey);
        reject(
          new Error(
            `MCP server "${this.config.name}" did not respond within ${MCP_REQUEST_TIMEOUT_MS}ms`,
          ),
        );
      }, MCP_REQUEST_TIMEOUT_MS);
      this.pendingRequests.set(pendingKey, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      stdin.write(`${JSON.stringify(jsonRpc)}\n`, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(pendingKey);
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

    // the agent loop.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MCP_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonRpc),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`MCP server "${this.config.name}" returned ${response.status}`);
      }

      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `MCP server "${this.config.name}" did not respond within ${MCP_REQUEST_TIMEOUT_MS}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

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
