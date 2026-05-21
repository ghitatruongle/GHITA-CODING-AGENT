// ==============================================================================
// GHITA CODING AGENT - AI Engine Package Entry
// ==============================================================================

// --- Types ---
export type {
  AIProvider,
  ChatMessage,
  ChatRole,
  ChatOptions,
  ChatResponse,
  TokenUsage,
  ProviderConfig,
  OrchestratorConfig,
  OrchestratorStatus,
} from './types.js';

// --- Providers ---
export { BaseProvider } from './providers/base.js';
export { OpenAIProvider } from './providers/openai.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { GoogleProvider } from './providers/google.js';
export { OllamaProvider } from './providers/ollama.js';
export { CustomProvider } from './providers/custom.js';

// --- Registry & Orchestrator ---
export { ProviderRegistry } from './registry.js';
export { Orchestrator } from './orchestrator.js';

// --- gRPC Server ---
export { GrpcServer } from './grpc/server.js';

// --- Configuration Loader ---
export { ConfigLoader } from './utils/configLoader.js';
export type { LocalConfig } from './utils/configLoader.js';

// --- Security Guard ---
export { SecurityGuard } from './utils/security.js';
export type { SecurityScanResult } from './utils/security.js';

// --- Cryptography Helper ---
export { CryptoHelper } from './utils/crypto.js';

// --- Ralph Loop Manager ---
export { RalphLoopManager } from './utils/ralph.js';
export type { RalphLoopConfig, RalphLoopState } from './utils/ralph.js';

// --- MCP (Model Context Protocol) ---
export { MCPClient } from './mcp/client.js';
export { StdioTransport, SSETransport, createTransport } from './mcp/transport.js';
export type { MCPServerConfig, MCPTool, MCPToolResult, MCPServerStatus, MCPConfig, MCPTransportType } from './mcp/types.js';

// --- Hooks ---
export { HookRunner } from './hooks/runner.js';
export type { HookConfig, HookEvent, HookResult, HookRunnerConfig, HookMatcher } from './hooks/types.js';

// --- Built-in Tools ---
export { WebSearchTool, WebFetchTool, createBuiltInTools } from './tools/index.js';
export type { SearchResult, SearchResponse } from './tools/index.js';
export type { FetchResponse } from './tools/index.js';
export type { BuiltInTool } from './tools/index.js';

// --- Context Manager ---
export { ContextManager } from './context/manager.js';
export type { ContextConfig } from './context/manager.js';

// --- Permission Manager ---
export { PermissionManager } from './security/permissions.js';
export type { PermissionLevel, ToolPermission } from './security/permissions.js';
