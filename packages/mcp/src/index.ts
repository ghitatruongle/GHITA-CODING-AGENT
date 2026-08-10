// ==============================================================================
// GHITA CODING AGENT - @ghita/mcp public entry
// ==============================================================================

export { MCPClient, createMCPClient } from './client.js';
export type { RemoteTool, CallToolResponse } from './client.js';
export { GhitaMCPServer, createMCPServer } from './server.js';
export { createLinkedPair } from './inmemory.js';
export { MCP_VERSION } from './types.js';
export type {
  ClientTransportKind,
  MCPClientConfig,
  ClientStdioConfig,
  ClientUrlConfig,
  ClientInMemoryConfig,
  ToolDefinition,
  ToolInputSchema,
  MCPToolResult,
  ServerHooks,
  ServerConfig,
} from './types.js';
