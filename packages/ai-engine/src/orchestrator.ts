// ==============================================================================
// GHITA CODING AGENT - AI Orchestrator
// ==============================================================================

import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import { retry, sleep } from '@ghita/shared';
import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  OrchestratorConfig,
  OrchestratorStatus,
} from './types.js';
import { ProviderRegistry } from './registry.js';
import { MCPClient } from './mcp/client.js';
import type { MCPTool, MCPToolResult } from './mcp/types.js';
import { HookRunner } from './hooks/runner.js';
import type { HookConfig, HookResult } from './hooks/types.js';
import { createBuiltInTools, type BuiltInTool } from './tools/index.js';
import { ContextManager } from './context/manager.js';
import { PermissionManager } from './security/permissions.js';
import { SecurityChecker } from './hooks/security-checkers.js';

export class Orchestrator {
  private registry: ProviderRegistry;
  private config: OrchestratorConfig;
  private defaultProvider: AIProviderType | null = null;
  private fallbackOrder: AIProviderType[] = [];

  // Phase 5-7 modules
  readonly mcpClient: MCPClient;
  readonly hookRunner: HookRunner;
  readonly builtInTools: BuiltInTool[];
  readonly contextManager: ContextManager;
  readonly permissionManager: PermissionManager;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.registry = new ProviderRegistry();

    // Đăng ký tất cả providers từ config
    for (const providerConfig of config.providers) {
      this.registry.registerFromConfig(providerConfig);
    }

    this.defaultProvider = config.defaultProvider ?? null;
    this.fallbackOrder = config.fallbackOrder ?? [];

    // Phase 5A: MCP Client
    this.mcpClient = new MCPClient();
    if (config.mcpServers) {
      for (const server of config.mcpServers) {
        this.mcpClient.addServer({
          name: server.name,
          command: server.command,
          args: server.args,
          url: server.url,
          transport: server.transport,
          env: server.env,
          enabled: server.enabled,
        });
      }
    }

    // Phase 5B: Hook Runner
    this.hookRunner = new HookRunner();
    this.hookRunner.addHook(new SecurityChecker().createPreToolHook());

    // Phase 5C: Built-in Tools
    this.builtInTools = createBuiltInTools();

    // Phase 6B: Context Manager
    this.contextManager = new ContextManager();

    // Phase 6D: Permission Manager
    this.permissionManager = new PermissionManager();
  }

  /** Lấy registry để truy cập providers trực tiếp */
  getRegistry(): ProviderRegistry {
    return this.registry;
  }

  /** Chat với provider ưu tiên, fallback nếu lỗi */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions & { provider?: AIProviderType },
  ): Promise<ChatResponse> {
    const provider = this.resolveProvider(options?.provider, options?.agentRole);
    const maxAttempts = this.config.retryAttempts ?? 2;

    return await this.executeWithFallback(
      (p) => p.chat(messages, options),
      provider,
      maxAttempts,
    );
  }

  /** Chat streaming với provider ưu tiên, fallback nếu lỗi */
  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions & { provider?: AIProviderType },
  ): AsyncGenerator<AIStreamChunk> {
    const provider = this.resolveProvider(options?.provider, options?.agentRole);
    const maxAttempts = this.config.retryAttempts ?? 2;

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        yield* provider.chatStream(messages, options);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxAttempts) {
          await sleep(this.config.retryDelayMs ?? 1000);
        }
      }
    }

    const fallback = this.findFallbackProvider(provider.type);
    if (fallback) {
      try {
        yield* fallback.chatStream(messages, options);
        return;
      } catch {
        throw lastError;
      }
    }
    throw lastError;
  }

  /** Test tất cả providers */
  async testAll(): Promise<Array<{ type: AIProviderType; ok: boolean; error?: string }>> {
    const results: Array<{ type: AIProviderType; ok: boolean; error?: string }> = [];

    for (const provider of this.registry.getAll()) {
      try {
        const ok = await provider.test();
        results.push({ type: provider.type, ok });
      } catch (error) {
        results.push({
          type: provider.type,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /** Lấy status tổng quan */
  async getStatus(): Promise<OrchestratorStatus> {
    const allProviders = this.registry.getAll();
    const statuses = await Promise.all(
      allProviders.map(async (p) => ({
        type: p.type,
        ready: await p.isReady(),
      })),
    );

    const readyProviders = statuses.filter((s) => s.ready);

    return {
      availableProviders: readyProviders.map((s) => s.type),
      defaultProvider: this.defaultProvider,
      totalProviders: allProviders.length,
      readyProviders: readyProviders.length,
    };
  }

  /** Đổi default provider */
  setDefaultProvider(type: AIProviderType | null): void {
    this.defaultProvider = type;
  }

  /** Đổi fallback order */
  setFallbackOrder(order: AIProviderType[]): void {
    this.fallbackOrder = order;
  }

  // --- Phase 5A: MCP ---

  /** Lấy tất cả MCP tools */
  getMCPTools(): MCPTool[] {
    return this.mcpClient.getAllTools();
  }

  /** Gọi MCP tool */
  async callMCPTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    return this.mcpClient.callTool(serverName, toolName, args);
  }

  // --- Phase 5B: Hooks ---

  /** Load hooks config */
  loadHooks(hooks: HookConfig[]): void {
    this.hookRunner.loadHooks(hooks);
  }

  /** Chạy pre-tool hooks */
  async runPreToolHooks(toolName: string, toolArgs?: Record<string, unknown>): Promise<HookResult[]> {
    return this.hookRunner.runHooks('pre_tool', toolName, toolArgs);
  }

  /** Chạy post-tool hooks */
  async runPostToolHooks(toolName: string, toolArgs?: Record<string, unknown>, toolResult?: string): Promise<HookResult[]> {
    return this.hookRunner.runHooks('post_tool', toolName, toolArgs, toolResult);
  }

  // --- Phase 5C: Built-in Tools ---

  /** Lấy built-in tool theo tên */
  getBuiltInTool(name: string): BuiltInTool | undefined {
    return this.builtInTools.find((t) => t.name === name);
  }

  /** Gọi built-in tool */
  async callBuiltInTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.getBuiltInTool(name);
    if (!tool) throw new Error(`Built-in tool "${name}" not found`);
    return tool.execute(args);
  }

  // --- Phase 6B: Context ---

  /** Kiểm tra context có cần compact không */
  needsContextCompact(messages: ChatMessage[]): boolean {
    return this.contextManager.needsCompact(messages);
  }

  /** Compact messages */
  compactContext(messages: ChatMessage[]): ChatMessage[] {
    return this.contextManager.compact(messages);
  }

  /** Lấy context usage */
  getContextUsage(messages: ChatMessage[]): { used: number; max: number; percentage: number } {
    return this.contextManager.getUsage(messages);
  }

  // --- Private ---

  private mapModelKeyToProviderType(modelKey: string): AIProviderType | null {
    const key = modelKey.toLowerCase();

    // Direct type match first
    const allTypes: AIProviderType[] = [
      'openai', 'anthropic', 'google', 'ollama', 'custom',
      'opengateway', 'mimo', 'openrouter', 'deepseek', 'groq',
      'mistral', 'hicap', 'github-models',
    ];
    for (const type of allTypes) {
      if (key === type || key.includes(type)) return type;
    }

    // Legacy keyword matching
    if (key.includes('claude')) return 'anthropic';
    if (key.includes('gemini')) return 'google';
    return null;
  }

  private resolveProvider(preferred?: AIProviderType, agentRole?: string): AIProvider {
    // 1. Ưu tiên cao nhất: Preferred provider do người dùng chỉ định thủ công
    if (preferred) {
      const p = this.registry.get(preferred);
      if (p) return p;
    }

    // 2. Định tuyến theo agentRole nếu có cấu hình routing
    if (agentRole && this.config.routing) {
      const modelKey = this.config.routing[agentRole] || this.config.routing['default'];
      if (modelKey) {
        const providerType = this.mapModelKeyToProviderType(modelKey);
        if (providerType) {
          const p = this.registry.get(providerType);
          if (p) return p;
        }
      }
    }

    // 3. Ưu tiên tiếp theo: defaultProvider > fallback đầu tiên > bất kỳ sẵn sàng
    if (this.defaultProvider) {
      const p = this.registry.get(this.defaultProvider);
      if (p) return p;
    }

    if (this.fallbackOrder.length > 0) {
      for (const type of this.fallbackOrder) {
        const p = this.registry.get(type);
        if (p) return p;
      }
    }

    // Lấy bất kỳ provider nào
    const all = this.registry.getAll();
    if (all.length > 0) return all[0]!;

    throw new Error('No AI providers registered');
  }

  private findFallbackProvider(currentType: AIProviderType): AIProvider | null {
    for (const type of this.fallbackOrder) {
      if (type === currentType) continue;
      const p = this.registry.get(type);
      if (p) return p;
    }
    return null;
  }

  private async executeWithFallback<T>(
    fn: (provider: AIProvider) => Promise<T>,
    primary: AIProvider,
    maxAttempts: number,
  ): Promise<T> {
    // Thử primary provider
    try {
      return await retry(() => fn(primary), maxAttempts, this.config.retryDelayMs ?? 1000);
    } catch (primaryError) {
      // Thử fallback
      const fallback = this.findFallbackProvider(primary.type);
      if (fallback) {
        try {
          return await fn(fallback);
        } catch {
          throw primaryError; // Throw lỗi của primary
        }
      }
      throw primaryError;
    }
  }
}
