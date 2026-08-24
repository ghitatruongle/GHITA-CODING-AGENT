import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  OrchestratorConfig,
  EmbeddingResponse,
  EmbeddingManyResponse,
} from '../types.js';
import type { ProviderRegistry } from '../registry.js';
import type { MCPClient } from '../mcp/client.js';
import type { MCPTool, MCPToolResult } from '../mcp/types.js';
import type { HookRunner } from '../hooks/runner.js';
import type { HookConfig, HookResult } from '../hooks/types.js';
import type { BuiltInTool } from '../tools/index.js';
import type { ContextManager } from '../context/manager.js';
import type { PermissionManager } from '../security/permissions.js';
import type { CostTracker, BudgetManager } from '../cost/index.js';
import type { SemanticCache } from '../cache/semantic-cache.js';
import type { SmartRouter } from '../routing/smart-router.js';
import type { ModelDiscovery } from '../discovery/model-discovery.js';
import type { GenerateObjectResponse } from '../utils/structured.js';

/** Internal orchestrator context exposed to decomposed sub-modules */
export interface OrchestratorContext {
  config: OrchestratorConfig;
  registry: ProviderRegistry;
  defaultProvider: AIProviderType | null;
  fallbackOrder: AIProviderType[];
  mcpClient: MCPClient;
  hookRunner: HookRunner;
  builtInTools: BuiltInTool[];
  contextManager: ContextManager;
  permissionManager: PermissionManager;
  costTracker: CostTracker;
  budgetManager: BudgetManager;
  semanticCache: SemanticCache;
  modelDiscovery: ModelDiscovery;
  smartRouter: SmartRouter | null;

  resolveProvider(preferred?: AIProviderType, agentRole?: string): AIProvider;
  findFallbackProvider(currentType: AIProviderType): AIProvider | null;
  executeWithFallback<T>(
    fn: (provider: AIProvider) => Promise<T>,
    primary: AIProvider,
    maxAttempts: number,
  ): Promise<T>;
}

/** Re-export types needed by sub-modules */
export type {
  AIProviderType,
  AIStreamChunk,
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  EmbeddingResponse,
  EmbeddingManyResponse,
  MCPTool,
  MCPToolResult,
  HookConfig,
  HookResult,
  BuiltInTool,
  GenerateObjectResponse,
};
