// ==============================================================================
// GHITA CODING AGENT - @ghita/mcp shared types
// ==============================================================================

/** Transport kinds supported by the client. */
export type ClientTransportKind = 'stdio' | 'sse' | 'http' | 'in-memory';

export interface ClientStdioConfig {
  kind: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface ClientUrlConfig {
  kind: 'sse' | 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface ClientInMemoryConfig {
  kind: 'in-memory';
  /** Client-side transport provided by the caller (embedded/tests). */
  transport: unknown;
}

export type MCPClientConfig = ClientStdioConfig | ClientUrlConfig | ClientInMemoryConfig;

/** JSON-schema-shaped tool input definition. */
export interface ToolInputSchema {
  type: 'object';
  description?: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

/** Tool definition registered on a Ghita MCP server. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  handler: (
    args: Record<string, unknown>,
  ) =>
    | Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>
    | { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
}

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Lifecycle hooks — guard and observe tool calls on the server. */
export interface ServerHooks {
  /** Return a string reason to deny a tool call (deny-default), undefined → allow. */
  preToolCall?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<string | undefined> | string | undefined;
  postToolCall?: (name: string, result: MCPToolResult, durationMs: number) => void;
  onError?: (name: string, err: unknown) => void;
}

export interface ServerConfig {
  name: string;
  version: string;
  tools?: ToolDefinition[];
  hooks?: ServerHooks;
}

export const MCP_VERSION = '1.1.0';
