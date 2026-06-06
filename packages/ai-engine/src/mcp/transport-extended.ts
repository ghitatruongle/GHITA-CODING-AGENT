// ==============================================================================
// GHITA CODING AGENT - MCP Transport Extensions (Phase 11)
// ==============================================================================
// Adds two new MCP transports on top of the base stdio/sse pair:
//   - HttpTransport  : JSON-RPC over plain HTTP POST with custom headers
//   - InProcessTransport : call a handler function in the same Node process
// A factory `createExtendedTransport` resolves any MCPTransportType
// (including 'http' and 'in-process') and is wired into the base
// `createTransport` switch via re-export.
// ==============================================================================

import type { MCPServerConfig } from './types.js';
import type { MCPTransport } from './transport.js';

// -----------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------

/** Handler signature for InProcessTransport. */
export type InProcessHandler = (
  request: Record<string, unknown>,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

/** Optional config block on MCPServerConfig for the new transports. */
export interface ExtendedServerConfig {
  /** Custom HTTP headers (auth tokens, user-agent, etc.) */
  headers?: Record<string, string>;
  /** Request timeout in ms (default 30_000) */
  timeoutMs?: number;
  /** In-process handler — used when transport === 'in-process' */
  handler?: InProcessHandler;
}

// -----------------------------------------------------------------------
// HttpTransport
// -----------------------------------------------------------------------

/**
 * Plain JSON-RPC over HTTP POST. Unlike SSETransport this does not hold
 * a long-lived stream — it sends one request, awaits one response, done.
 * Suitable for stateless MCP servers that expose a single RPC endpoint.
 */
export class HttpTransport implements MCPTransport {
  private connected = false;
  private requestId = 0;
  private readonly timeoutMs: number;

  constructor(private readonly config: MCPServerConfig & ExtendedServerConfig) {
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async connect(): Promise<void> {
    if (!this.config.url) {
      throw new Error(
        `MCP server "${this.config.name}": url is required for http transport`,
      );
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
    const url = this.config.url;
    if (!url) {
      throw new Error(`MCP server "${this.config.name}": url not configured`);
    }

    const id = ++this.requestId;
    const jsonRpc = { jsonrpc: '2.0', id, ...request };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(this.config.headers ?? {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(jsonRpc),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `MCP server "${this.config.name}" returned ${response.status}: ${text}`,
        );
      }

      return (await response.json()) as Record<string, unknown>;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(
          `MCP server "${this.config.name}" request timed out after ${this.timeoutMs}ms`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// -----------------------------------------------------------------------
// InProcessTransport
// -----------------------------------------------------------------------

/**
 * Talks to a handler running in the same Node process. Useful for
 * embedding test doubles, in-memory mocks, and micro-MCP servers
 * (e.g. the official registry catalog exposed as a process-local server).
 */
export class InProcessTransport implements MCPTransport {
  private connected = false;
  private requestId = 0;

  constructor(private readonly config: MCPServerConfig & ExtendedServerConfig) {}

  async connect(): Promise<void> {
    if (typeof this.config.handler !== 'function') {
      throw new Error(
        `MCP server "${this.config.name}": handler function is required for in-process transport`,
      );
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
    const handler = this.config.handler;
    if (typeof handler !== 'function') {
      throw new Error(`MCP server "${this.config.name}": handler missing`);
    }

    const id = ++this.requestId;
    const jsonRpc = { jsonrpc: '2.0', id, ...request };

    try {
      const result = await handler(jsonRpc);
      // If handler returned nothing, fabricate an ack-shaped reply
      if (!result || typeof result !== 'object') {
        return { jsonrpc: '2.0', id, result: null };
      }
      // Stamp id if handler forgot
      if (!('id' in result)) (result as Record<string, unknown>).id = id;
      return result;
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: (err as Error).message ?? 'in-process handler error',
        },
      };
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// -----------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------

/**
 * Extended factory that knows about the two new transports. The base
 * `createTransport` (transport.ts) still handles stdio/sse.
 */
export function createExtendedTransport(
  config: MCPServerConfig & ExtendedServerConfig,
): MCPTransport {
  switch (config.transport) {
    case 'http':
      return new HttpTransport(config);
    case 'in-process':
      return new InProcessTransport(config);
    default: {
      // Re-export the base factory for the legacy transport types
      // (we import lazily to avoid a cycle with transport.ts)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createTransport } = require('./transport.js') as { createTransport: (cfg: MCPServerConfig) => MCPTransport };
      return createTransport(config);
    }
  }
}
