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
  EmbeddingResponse,
  EmbeddingManyResponse,
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
import type { z } from 'zod';
import { generateObject, type GenerateObjectResponse } from './utils/structured.js';
import { SemanticCache } from './utils/cache.js';
import { CostTracker, BudgetManager } from './utils/cost.js';
import { SmartRouter } from './routing/smart-router.js';
import type { RoutingDecision } from './routing/types.js';
import { ModelDiscovery } from './discovery/model-discovery.js';
import type { DiscoveryResult } from './discovery/types.js';

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

  // Phase 8 modules
  readonly costTracker: CostTracker;
  readonly budgetManager: BudgetManager;
  readonly semanticCache: SemanticCache;

  // Phase 1.3+1.4: Discovery & Smart Routing
  readonly modelDiscovery: ModelDiscovery;
  readonly smartRouter: SmartRouter | null = null;

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

    // Phase 8: Cost tracking & Budget management
    this.costTracker = new CostTracker();
    const limit = config.costLimitUsd ?? 5.0; // Default budget limit e.g. $5.00
    this.budgetManager = new BudgetManager({
      limit,
      period: 'monthly',
      onAlert: (spent, limit, percentage) => {
        console.warn(`[Orchestrator] AI budget alert: spent $${spent.toFixed(4)} of $${limit.toFixed(4)} (${(percentage * 100).toFixed(1)}%)`);
      }
    });

    // Phase 8: Semantic prompt cache
    this.semanticCache = new SemanticCache(
      {
        embed: async (text) => {
          const emb = await this.embed(text);
          return { embedding: emb.embedding };
        }
      },
      {
        qdrantUrl: config.qdrantUrl,
        collectionName: config.collectionName,
        threshold: config.cacheThreshold ?? 0.95,
        fallbackToInMemory: true
      }
    );

    // Phase 1.3: Model Discovery
    this.modelDiscovery = new ModelDiscovery();

    // Phase 1.4: Smart Router
    if (config.smartRouting) {
      this.smartRouter = new SmartRouter({
        strategy: config.smartRouting.strategy,
        maxCostPerRequest: config.smartRouting.maxCostPerRequest,
        maxLatencyMs: config.smartRouting.maxLatencyMs,
        minQualityScore: config.smartRouting.minQualityScore,
      });
    }
  }

  /** Lấy registry để truy cập providers trực tiếp */
  getRegistry(): ProviderRegistry {
    return this.registry;
  }

  /** Phase 1.3: Discover models từ provider API */
  async discoverModels(providerType?: AIProviderType): Promise<DiscoveryResult> {
    const config = this.config.providers.find((p) => p.type === providerType);
    if (!config) throw new Error(`Provider ${providerType} not configured`);
    return this.modelDiscovery.discoverModels({
      baseUrl: config.baseUrl ?? '',
      apiKey: config.apiKey,
      providerType: providerType as string,
      authStyle: 'bearer',
      parseResponse: (data: unknown) => {
        const d = data as { data?: { id: string }[] };
        return (d.data ?? []).map((m) => ({ id: m.id, name: m.id, provider: providerType as string }));
      },
    });
  }

  /** Phase 1.4: Get routing metrics */
  getRoutingMetrics() {
    return this.smartRouter?.getMetrics() ?? [];
  }

  /** Phase 1.4: Get routing decision */
  getRoutingDecision(_preferred?: AIProviderType, _agentRole?: string): RoutingDecision | null {
    if (!this.smartRouter) return null;
    const available = this.registry.getAll().map((p) => ({ type: p.type, model: p.defaultModel }));
    return this.smartRouter.route(available);
  }

  /** Chat với provider ưu tiên, fallback nếu lỗi */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions & { provider?: AIProviderType },
  ): Promise<ChatResponse> {
    const serializeMessages = (msgs: ChatMessage[]): string =>
      msgs.map((m) => `[${m.role}]: ${m.content}`).join('\n');
    const cacheKey = serializeMessages(messages);

    try {
      const cached = await this.semanticCache.get(cacheKey);
      if (cached) {
        return cached as ChatResponse;
      }
    } catch {}

    const provider = this.resolveProvider(options?.provider, options?.agentRole);
    this.budgetManager.checkBudget(0);

    const maxAttempts = this.config.retryAttempts ?? 2;

    const response = await this.executeWithFallback(
      (p) => p.chat(messages, options),
      provider,
      maxAttempts,
    );

    const modelName = options?.model || provider.defaultModel || 'default';
    const promptTokens = response.usage?.promptTokens ?? 0;
    const completionTokens = response.usage?.completionTokens ?? 0;

    const stepCost = this.costTracker.calculateCost(modelName, promptTokens, completionTokens);
    await this.costTracker.trackCost(modelName, promptTokens, completionTokens);
this.budgetManager.recordSpent(stepCost);

  if ((globalThis as Record<string, unknown>).broadcastCostTelemetryHandler) {
    try {
      const handler = (globalThis as Record<string, unknown>).broadcastCostTelemetryHandler as (data: Record<string, unknown>) => void;
      handler({
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: this.costTracker.getTotalCost(),
      limitUsd: this.budgetManager.getLimit(),
    });
    } catch {}
  }

  try {
      await this.semanticCache.set(cacheKey, response);
    } catch {}

    return response;
  }

  /** Chat streaming với provider ưu tiên, fallback nếu lỗi */
  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions & { provider?: AIProviderType },
  ): AsyncGenerator<AIStreamChunk> {
    const serializeMessages = (msgs: ChatMessage[]): string =>
      msgs.map((m) => `[${m.role}]: ${m.content}`).join('\n');
    const cacheKey = serializeMessages(messages);

    try {
      const cached = await this.semanticCache.get(cacheKey) as ChatResponse | null;
      if (cached) {
        yield {
          content: cached.content,
          done: true,
          provider: cached.provider,
          model: cached.model,
          usage: cached.usage,
        };
        return;
      }
    } catch {}

    const provider = this.resolveProvider(options?.provider, options?.agentRole);
    this.budgetManager.checkBudget(0);

    const maxAttempts = this.config.retryAttempts ?? 2;
    let accumulatedContent = '';
    let resolvedProvider = provider.type;
    let resolvedModel = options?.model || provider.defaultModel || 'default';
    let finalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let success = false;
    let lastError: Error | undefined;

    try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        accumulatedContent = '';
        const stream = provider.chatStream(messages, options);
        for await (const chunk of stream) {
          accumulatedContent += chunk.content;
          if (chunk.provider) resolvedProvider = chunk.provider;
          if (chunk.model) resolvedModel = chunk.model;
          if (chunk.usage) {
            finalUsage = {
              promptTokens: chunk.usage.promptTokens,
              completionTokens: chunk.usage.completionTokens,
              totalTokens: chunk.usage.totalTokens,
            };
          }
          yield chunk;
        }
        success = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxAttempts) {
          await sleep(this.config.retryDelayMs ?? 1000);
        }
      }
    }

    if (!success) {
      const fallback = this.findFallbackProvider(provider.type);
      if (fallback) {
        try {
          accumulatedContent = '';
          resolvedProvider = fallback.type;
          resolvedModel = options?.model || fallback.defaultModel || 'default';
          const stream = fallback.chatStream(messages, options);
          for await (const chunk of stream) {
            accumulatedContent += chunk.content;
            if (chunk.provider) resolvedProvider = chunk.provider;
            if (chunk.model) resolvedModel = chunk.model;
            if (chunk.usage) {
              finalUsage = {
                promptTokens: chunk.usage.promptTokens,
                completionTokens: chunk.usage.completionTokens,
                totalTokens: chunk.usage.totalTokens,
              };
            }
            yield chunk;
          }
          success = true;
        } catch {
          throw lastError;
        }
      } else {
        throw lastError;
      }
    }

    // Cache the fully compiled response
    const completeResponse: ChatResponse = {
      content: accumulatedContent,
      model: resolvedModel,
      provider: resolvedProvider,
      usage: finalUsage,
      finishReason: 'stop',
    };

    try {
      await this.semanticCache.set(cacheKey, completeResponse);
    } catch {}
    } finally {
      // Cost tracking always runs regardless of consumer behavior (early return/cancel)
      if (success) {
        if (finalUsage.totalTokens === 0) {
          const promptText = serializeMessages(messages);
          const estPrompt = Math.ceil(promptText.length / 4);
          const estCompletion = Math.ceil(accumulatedContent.length / 4);
          finalUsage = {
            promptTokens: estPrompt,
            completionTokens: estCompletion,
            totalTokens: estPrompt + estCompletion,
          };
        }

        const stepCost = this.costTracker.calculateCost(resolvedModel, finalUsage.promptTokens, finalUsage.completionTokens);
        await this.costTracker.trackCost(resolvedModel, finalUsage.promptTokens, finalUsage.completionTokens);
        this.budgetManager.recordSpent(stepCost);

        if ((globalThis as Record<string, unknown>).broadcastCostTelemetryHandler) {
          try {
            const handler = (globalThis as Record<string, unknown>).broadcastCostTelemetryHandler as (data: Record<string, unknown>) => void;
            handler({
              inputTokens: finalUsage.promptTokens,
              outputTokens: finalUsage.completionTokens,
              totalTokens: finalUsage.totalTokens,
              costUsd: this.costTracker.getTotalCost(),
              limitUsd: this.budgetManager.getLimit(),
            });
          } catch {}
        }
      }
    }
  }

  /** Tạo cấu trúc đầu ra (structured output) theo schema của Zod */
  async generateObject<T>(
    schema: z.ZodType<T>,
    messages: ChatMessage[],
    options?: ChatOptions & { provider?: AIProviderType }
  ): Promise<GenerateObjectResponse<T>> {
    return generateObject(this, schema, messages, options);
  }

  /** Tạo vector embedding cho một chuỗi text */
  async embed(
    text: string,
    options?: { model?: string; provider?: AIProviderType }
  ): Promise<EmbeddingResponse> {
    const provider = this.resolveProvider(options?.provider);
    const maxAttempts = this.config.retryAttempts ?? 2;

    return await this.executeWithFallback(
      (p) => p.embed(text, options),
      provider,
      maxAttempts,
    );
  }

  /** Tạo vector embedding cho danh sách các chuỗi text */
  async embedMany(
    texts: string[],
    options?: { model?: string; provider?: AIProviderType }
  ): Promise<EmbeddingManyResponse> {
    const provider = this.resolveProvider(options?.provider);
    const maxAttempts = this.config.retryAttempts ?? 2;

    return await this.executeWithFallback(
      (p) => p.embedMany(texts, options),
      provider,
      maxAttempts,
    );
  }

  /** Sinh ảnh từ văn bản */
  async generateImage(
    prompt: string,
  options?: Record<string, unknown> & { provider?: AIProviderType }
): Promise<{ url: string; b64?: string }> {
    const provider = this.resolveProvider(options?.provider);
    const maxAttempts = this.config.retryAttempts ?? 2;

    return await this.executeWithFallback(
      (p) => {
        if (!p.generateImage) {
          throw new Error(`${p.name} does not support generateImage`);
        }
        return p.generateImage(prompt, options);
      },
      provider,
      maxAttempts,
    );
  }

  /** Chuyển văn bản thành giọng nói */
  async generateSpeech(
    text: string,
  options?: Record<string, unknown> & { provider?: AIProviderType }
): Promise<{ audio: Buffer; contentType: string }> {
    const provider = this.resolveProvider(options?.provider);
    const maxAttempts = this.config.retryAttempts ?? 2;

    return await this.executeWithFallback(
      (p) => {
        if (!p.generateSpeech) {
          throw new Error(`${p.name} does not support generateSpeech`);
        }
        return p.generateSpeech(text, options);
      },
      provider,
      maxAttempts,
    );
  }

  /** Sinh video từ văn bản */
  async generateVideo(
    prompt: string,
  options?: Record<string, unknown> & { provider?: AIProviderType }
): Promise<{ url: string }> {
    const provider = this.resolveProvider(options?.provider);
    const maxAttempts = this.config.retryAttempts ?? 2;

    return await this.executeWithFallback(
      (p) => {
        if (!p.generateVideo) {
          throw new Error(`${p.name} does not support generateVideo`);
        }
        return p.generateVideo(prompt, options);
      },
      provider,
      maxAttempts,
    );
  }

  /** Chuyển giọng nói thành văn bản */
  async transcribe(
    audio: Buffer,
  options?: Record<string, unknown> & { provider?: AIProviderType }
): Promise<{ text: string }> {
    const provider = this.resolveProvider(options?.provider);
    const maxAttempts = this.config.retryAttempts ?? 2;

    return await this.executeWithFallback(
      (p) => {
        if (!p.transcribe) {
          throw new Error(`${p.name} does not support transcribe`);
        }
        return p.transcribe(audio, options);
      },
      provider,
      maxAttempts,
    );
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
      'cerebras', 'together', 'fireworks', 'cohere', 'xai',
      'replicate', 'perplexity', 'voyage', 'ai21', 'sambanova', 'novita',
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
  if (all.length > 0) {
    const first = all[0];
    if (first) return first;
  }

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
