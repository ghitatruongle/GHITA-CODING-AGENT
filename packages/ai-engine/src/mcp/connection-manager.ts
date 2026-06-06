// ==============================================================================
// GHITA CODING AGENT - MCP Connection Manager + OAuth (Phase 11)
// ==============================================================================
// Phase 11 introduces:
//   - MCPConnectionManager : pool of MCP servers with reconnect, health
//                           checks, and lifecycle hooks
//   - OAuth token cache     : in-memory store with auto-refresh hook for
//                             OAuth-protected MCP servers
//   - Official MCP server registry : declarative list of well-known servers
//                                   the user can enable with one click
// ==============================================================================

import type {
  MCPServerConfig,
  MCPServerStatus,
  MCPTool,
  MCPToolResult,
} from './types.js';
import { createExtendedTransport, type ExtendedServerConfig, type InProcessHandler } from './transport-extended.js';
import type { MCPTransport } from './transport.js';

// -----------------------------------------------------------------------
// Connection Manager
// -----------------------------------------------------------------------

export interface MCPConnectionManagerOptions {
  /** Reconnect attempts on transport failure (default: 3) */
  maxReconnectAttempts?: number;
  /** Delay between reconnect attempts in ms (default: 1000) */
  reconnectDelayMs?: number;
  /** Health-check interval in ms (0 = disabled, default: 30_000) */
  healthCheckIntervalMs?: number;
}

interface ManagedServer {
  config: MCPServerConfig & ExtendedServerConfig;
  transport: MCPTransport;
  connected: boolean;
  tools: MCPTool[];
  error?: string;
  reconnectAttempts: number;
  healthTimer?: NodeJS.Timeout;
  oauthToken?: string;
}

/**
 * Manages the lifecycle of all registered MCP servers: connect,
 * discover tools, reconnect on failure, expose aggregated status.
 */
export class MCPConnectionManager {
  private readonly servers = new Map<string, ManagedServer>();
  private readonly opts: Required<MCPConnectionManagerOptions>;

  constructor(options: MCPConnectionManagerOptions = {}) {
    this.opts = {
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      reconnectDelayMs: options.reconnectDelayMs ?? 1000,
      healthCheckIntervalMs: options.healthCheckIntervalMs ?? 30_000,
    };
  }

  // -----------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------

  /** Add or replace a server in the pool. Does not connect. */
  addServer(config: MCPServerConfig & ExtendedServerConfig): void {
    if (this.servers.has(config.name)) {
      this.removeServer(config.name);
    }
    this.servers.set(config.name, {
      config,
      transport: createExtendedTransport(config),
      connected: false,
      tools: [],
      reconnectAttempts: 0,
    });
  }

  /** Remove a server. Disconnects first. */
  removeServer(name: string): void {
    const entry = this.servers.get(name);
    if (!entry) return;
    this.stopHealthCheck(entry);
    void entry.transport.disconnect();
    this.servers.delete(name);
  }

  /** Register a quick in-process handler without a full config. */
  registerHandler(name: string, handler: InProcessHandler): void {
    this.addServer({
      name,
      transport: 'in-process',
      enabled: true,
      handler,
    });
  }

  // -----------------------------------------------------------------
  // Connection
  // -----------------------------------------------------------------

  /** Connect a single server and discover its tools. */
  async connect(name: string): Promise<MCPTool[]> {
    const entry = this.servers.get(name);
    if (!entry) {
      throw new Error(`MCP server "${name}" is not registered`);
    }
    if (!entry.config.enabled) {
      throw new Error(`MCP server "${name}" is disabled in config`);
    }

    try {
      await entry.transport.connect();
      entry.connected = true;
      entry.error = undefined;
      entry.reconnectAttempts = 0;
      entry.tools = await this.discoverTools(entry);
      this.startHealthCheck(entry);
      return entry.tools;
    } catch (err) {
      entry.connected = false;
      entry.error = (err as Error).message;
      throw err;
    }
  }

  /** Connect every enabled server. Failures are captured in status. */
  async connectAll(): Promise<Record<string, MCPTool[]>> {
    const out: Record<string, MCPTool[]> = {};
    for (const [name, entry] of this.servers) {
      if (!entry.config.enabled) continue;
      try {
        out[name] = await this.connect(name);
      } catch (err) {
        out[name] = [];
        // already recorded in entry.error
      }
    }
    return out;
  }

  /** Disconnect a single server. */
  async disconnect(name: string): Promise<void> {
    const entry = this.servers.get(name);
    if (!entry) return;
    this.stopHealthCheck(entry);
    await entry.transport.disconnect();
    entry.connected = false;
  }

  /** Disconnect every server. */
  async disconnectAll(): Promise<void> {
    await Promise.all([...this.servers.keys()].map((n) => this.disconnect(n)));
  }

  // -----------------------------------------------------------------
  // Tool calls
  // -----------------------------------------------------------------

  /** Invoke a tool on a specific server. */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const entry = this.servers.get(serverName);
    if (!entry) {
      throw new Error(`MCP server "${serverName}" is not registered`);
    }
    if (!entry.connected) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }
    const response = await entry.transport.send({
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });

    if (response.error) {
      return {
        content: [
          { type: 'text', text: JSON.stringify(response.error) },
        ],
        isError: true,
      };
    }
    const result = (response.result ?? {}) as { content?: MCPToolResult['content'] };
    return { content: result.content ?? [], isError: false };
  }

  // -----------------------------------------------------------------
  // Status / introspection
  // -----------------------------------------------------------------

  /** Aggregate status snapshot for every registered server. */
  getStatus(): MCPServerStatus[] {
    return [...this.servers.values()].map((entry) => ({
      name: entry.config.name,
      connected: entry.connected,
      tools: entry.tools,
      error: entry.error,
      lastPing: entry.healthTimer ? Date.now() : undefined,
    }));
  }

  /** List of tools across every connected server. */
  listTools(): MCPTool[] {
    const out: MCPTool[] = [];
    for (const entry of this.servers.values()) {
      if (entry.connected) out.push(...entry.tools);
    }
    return out;
  }

  /** Number of currently-connected servers. */
  get connectedCount(): number {
    let n = 0;
    for (const entry of this.servers.values()) if (entry.connected) n += 1;
    return n;
  }

  // -----------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------

  private async discoverTools(entry: ManagedServer): Promise<MCPTool[]> {
    const response = await entry.transport.send({ method: 'tools/list' });
    const result = (response.result ?? {}) as { tools?: MCPTool[] };
    return (result.tools ?? []).map((t) => ({ ...t, serverName: entry.config.name }));
  }

  private startHealthCheck(entry: ManagedServer): void {
    if (this.opts.healthCheckIntervalMs <= 0) return;
    this.stopHealthCheck(entry);
    entry.healthTimer = setInterval(() => {
      // Soft ping: if transport reports not connected, try to reconnect.
      if (!entry.transport.isConnected()) {
        entry.connected = false;
        void this.attemptReconnect(entry.config.name);
      }
    }, this.opts.healthCheckIntervalMs);
  }

  private stopHealthCheck(entry: ManagedServer): void {
    if (entry.healthTimer) {
      clearInterval(entry.healthTimer);
      entry.healthTimer = undefined;
    }
  }

  private async attemptReconnect(name: string): Promise<void> {
    const entry = this.servers.get(name);
    if (!entry) return;
    if (entry.reconnectAttempts >= this.opts.maxReconnectAttempts) {
      entry.error = `gave up after ${entry.reconnectAttempts} reconnect attempts`;
      return;
    }
    entry.reconnectAttempts += 1;
    try {
      await entry.transport.disconnect();
      await new Promise((r) => setTimeout(r, this.opts.reconnectDelayMs));
      await this.connect(name);
    } catch (err) {
      entry.error = (err as Error).message;
    }
  }
}

// -----------------------------------------------------------------------
// OAuth token cache
// -----------------------------------------------------------------------

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  /** Expiry epoch ms; if 0/undefined the token is treated as never-expiring. */
  expiresAt?: number;
}

export type TokenRefresher = (refreshToken: string) => Promise<OAuthToken>;

/**
 * In-memory token store keyed by server name. The optional refresher
 * is invoked automatically when a cached token has expired.
 */
export class OAuthTokenCache {
  private readonly tokens = new Map<string, OAuthToken>();
  private readonly refresher?: TokenRefresher;
  private readonly skewMs: number;

  constructor(opts: { refresher?: TokenRefresher; clockSkewMs?: number } = {}) {
    this.refresher = opts.refresher;
    this.skewMs = opts.clockSkewMs ?? 30_000; // refresh 30s before expiry
  }

  set(serverName: string, token: OAuthToken): void {
    this.tokens.set(serverName, token);
  }

  get(serverName: string): OAuthToken | undefined {
    return this.tokens.get(serverName);
  }

  delete(serverName: string): void {
    this.tokens.delete(serverName);
  }

  /**
   * Return a usable access token, refreshing if necessary.
   * Returns undefined if no token is cached and no refresher is set.
   */
  async getValid(serverName: string): Promise<string | undefined> {
    const token = this.tokens.get(serverName);
    if (!token) return undefined;

    const now = Date.now();
    const expired = token.expiresAt !== undefined && token.expiresAt - this.skewMs <= now;

    if (!expired) return token.accessToken;

    if (token.refreshToken && this.refresher) {
      try {
        const refreshed = await this.refresher(token.refreshToken);
        this.tokens.set(serverName, refreshed);
        return refreshed.accessToken;
      } catch {
        return token.accessToken; // fall back to expired token
      }
    }
    return token.accessToken;
  }
}

// -----------------------------------------------------------------------
// Official MCP server registry
// ---------------------------------------------------------------------

/** Declarative entry in the official MCP server registry. */
export interface OfficialMCPServer {
  /** Stable id used for one-click install */
  id: string;
  /** Display name */
  name: string;
  /** Short description for the picker UI */
  description: string;
  /** Default transport type */
  transport: MCPServerConfig['transport'];
  /** Default command (for stdio) */
  command?: string;
  /** Default args (for stdio) */
  args?: string[];
  /** Default URL (for http/sse) */
  url?: string;
  /** Required env var names (user must supply at install time) */
  requiredEnv?: string[];
  /** Default enabled state */
  enabledByDefault: boolean;
  /** Categorization for the picker UI */
  category: 'browser' | 'filesystem' | 'git' | 'database' | 'productivity' | 'other';
}

/**
 * Curated list of well-known MCP servers. The UI lets the user pick
 * one of these and pre-fills MCPServerConfig accordingly.
 */
export const OFFICIAL_MCP_REGISTRY: OfficialMCPServer[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read/write local files inside the workspace',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    requiredEnv: [],
    enabledByDefault: false,
    category: 'filesystem',
  },
  {
    id: 'git',
    name: 'Git',
    description: 'Inspect commits, diffs, blame and history',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    requiredEnv: [],
    enabledByDefault: false,
    category: 'git',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Issues, PRs and code search via the GitHub API',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    requiredEnv: ['GITHUB_TOKEN'],
    enabledByDefault: false,
    category: 'git',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and inspect a PostgreSQL database',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    requiredEnv: ['DATABASE_URL'],
    enabledByDefault: false,
    category: 'database',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Drive a headless browser for scraping and testing',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    requiredEnv: [],
    enabledByDefault: false,
    category: 'browser',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Read and post messages to Slack workspaces',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    requiredEnv: ['SLACK_TOKEN'],
    enabledByDefault: false,
    category: 'productivity',
  },
];

/** Look up an official server entry by id. */
export function getOfficialServer(id: string): OfficialMCPServer | undefined {
  return OFFICIAL_MCP_REGISTRY.find((s) => s.id === id);
}

/** Convert an official entry into a runnable MCPServerConfig. */
export function officialToConfig(
  entry: OfficialMCPServer,
  overrides: Partial<MCPServerConfig> = {},
): MCPServerConfig {
  return {
    name: overrides.name ?? entry.name,
    transport: entry.transport,
    command: entry.command,
    args: entry.args,
    url: entry.url,
    enabled: overrides.enabled ?? entry.enabledByDefault,
  };
}
