/** Transport type cho MCP server */
export type MCPTransportType = 'stdio' | 'sse' | 'http' | 'in-process';

export interface MCPServerConfig {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  transport: MCPTransportType;
  env?: Record<string, string>;
  enabled: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

export interface MCPToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

/** MCP Server status */
export interface MCPServerStatus {
  name: string;
  connected: boolean;
  tools: MCPTool[];
  error?: string;
  lastPing?: number;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
}
