// ==============================================================================
// GHITA CODING AGENT - Multi-LLM Provider Unified Router Gateway (Phase 15)
// ==============================================================================

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ProviderConfig,
  EmbeddingResponse,
  EmbeddingManyResponse,
} from '../types.js';
import { ProviderRegistry } from '../registry.js';
import { CryptoHelper } from '../utils/crypto.js';
import { FallbackManager } from '../gateway/fallbackManager.js';

export interface UnifiedRouterOptions {
  registry?: ProviderRegistry;
  defaultProvider?: AIProviderType;
  fallbackOrder?: AIProviderType[];
  encryptionKey?: string;
  modelsConfigPath?: string;
  dbPath?: string;
  budgetConfigPath?: string;
}

export interface LatencyMetric {
  provider: AIProviderType;
  model: string;
  startTime: number;
  durationMs: number;
  success: boolean;
}

export class UnifiedRouter implements AIProvider {
  readonly type = 'custom' as const;
  readonly name = 'UnifiedRouterGateway';
  private registry: ProviderRegistry;
  private defaultProvider: AIProviderType = 'openai';
  private fallbackOrder: AIProviderType[] = ['openai', 'anthropic', 'google', 'ollama'];
  private encryptionKey: string;
  private configPath: string;
  private latencyHistory: LatencyMetric[] = [];
  public fallbackManager: FallbackManager;

  // Keep-alive agents
  private readonly httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 1000 });
  private readonly httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 1000 });

  constructor(options: UnifiedRouterOptions = {}) {
    this.registry = options.registry || new ProviderRegistry();
    this.defaultProvider = options.defaultProvider || 'openai';
    this.fallbackOrder = options.fallbackOrder || ['openai', 'anthropic', 'google', 'ollama'];
    this.encryptionKey = options.encryptionKey || process.env.GHITA_ENCRYPTION_KEY || '';
    if (!options.encryptionKey && !process.env.GHITA_ENCRYPTION_KEY) {
      throw new Error(
        'GHITA_ENCRYPTION_KEY environment variable or options.encryptionKey is required',
      );
    }
    this.configPath =
      options.modelsConfigPath || path.resolve(process.cwd(), '.ghita', 'models.yaml');

    this.fallbackManager = new FallbackManager({
      dbPath: options.dbPath,
      budgetConfigPath: options.budgetConfigPath,
      fallbackChain: this.fallbackOrder.map((provider) => {
        if (provider === 'openai') return 'gpt-4o';
        if (provider === 'anthropic') return 'claude-3-7-sonnet';
        if (provider === 'google') return 'gemini-2.5-pro';
        if (provider === 'ollama') return 'ollama';
        return provider;
      }),
    });

    this.loadConfig();
  }

  get defaultModel(): string {
    const prov = this.getPrimaryProvider();
    return prov.defaultModel;
  }

  get models(): string[] {
    const prov = this.getPrimaryProvider();
    return prov.models;
  }

  /**
   * Tải và phân tích cấu hình từ file .ghita/models.yaml
   */
  public loadConfig(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        // Fallback to environment variables if models.yaml doesn't exist
        this.loadFromEnv();
        return;
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      const configs = this.parseSimpleYaml(content);

      if (configs.length === 0) {
        this.loadFromEnv();
        return;
      }

      for (const config of configs) {
        // Tự động giải mã API Key nếu được mã hóa AES (chứa prefix "iv:")
        if (config.apiKey && config.apiKey.includes(':')) {
          try {
            config.apiKey = CryptoHelper.decrypt(config.apiKey, this.encryptionKey);
          } catch (err) {
            console.error(
              `Failed to decrypt API Key for provider ${config.type}. Check your encryption key.`,
            );
          }
        }

        // Đăng ký hoặc cập nhật provider
        this.registry.registerFromConfig(config);
      }
    } catch (err) {
      console.error('Failed to load .ghita/models.yaml, falling back to environment:', err);
      this.loadFromEnv();
    }
  }

  /**
   * Phân tích cú pháp YAML đơn giản không dùng thư viện ngoài
   */
  private parseSimpleYaml(content: string): ProviderConfig[] {
    const configs: ProviderConfig[] = [];
    const lines = content.split(/\r?\n/);
    let currentConfig: Partial<ProviderConfig> | null = null;
    let inProvidersSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = line.length - line.trimStart().length;

      if (trimmed.startsWith('providers:')) {
        inProvidersSection = true;
        continue;
      }

      if (inProvidersSection) {
        // If indent returns to 0 and does not start with dash, we exited the block
        if (indent === 0 && !trimmed.startsWith('-')) {
          inProvidersSection = false;
          continue;
        }

        if (trimmed.startsWith('-')) {
          if (currentConfig && currentConfig.type) {
            configs.push(currentConfig as ProviderConfig);
          }
          currentConfig = {};
          const rest = trimmed.substring(1).trim();
          if (rest.includes(':')) {
            const [k, ...v] = rest.split(':');
            const key = (k ?? '').trim();
            const val = v
              .join(':')
              .trim()
              .replace(/^['"]|['"]$/g, '');
            (currentConfig as Record<string, unknown>)[key] = val;
          }
        } else if (trimmed.includes(':') && currentConfig) {
          const [k, ...v] = trimmed.split(':');
          const key = (k ?? '').trim();
          const val = v
            .join(':')
            .trim()
            .replace(/^['"]|['"]$/g, '');
          if (key === 'maxTokens' || key === 'temperature') {
            (currentConfig as Record<string, unknown>)[key] = Number(val);
          } else {
            (currentConfig as Record<string, unknown>)[key] = val;
          }
        }
      }
    }

    if (currentConfig && currentConfig.type) {
      configs.push(currentConfig as ProviderConfig);
    }

    return configs;
  }

  private loadFromEnv(): void {
    const envProviders: ProviderConfig[] = [
      {
        type: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o',
      },
      {
        type: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
        defaultModel: 'claude-3-5-sonnet-latest',
      },
      {
        type: 'google',
        apiKey: process.env.GEMINI_API_KEY,
        baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
        defaultModel: 'gemini-1.5-pro',
      },
      {
        type: 'ollama',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        defaultModel: 'llama3',
      },
    ];

    for (const config of envProviders) {
      if ((config.apiKey || config.type === 'ollama') && !this.registry.has(config.type)) {
        this.registry.registerFromConfig(config);
      }
    }
  }

  async isReady(): Promise<boolean> {
    const primary = this.getPrimaryProvider();
    return await primary.isReady();
  }

  async test(): Promise<boolean> {
    const primary = this.getPrimaryProvider();
    return await primary.test();
  }

  /**
   * Gọi mô hình chat đồng bộ (không streaming) kèm theo theo dõi độ trễ và định dạng prompt
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    return this.fallbackManager.executeWithFailover(
      async (model: string) => {
        const resolvedOptions = { ...options, model };
        const provider = this.resolveProvider(resolvedOptions);
        const adaptedMessages = this.adaptPrompts(messages, provider.type);
        const startTime = Date.now();
        const updatedOptions = this.injectKeepAlive(resolvedOptions, provider.type);

        try {
          const response = await provider.chat(adaptedMessages, updatedOptions);
          const durationMs = Date.now() - startTime;
          this.logLatency(provider.type, response.model, startTime, durationMs, true);
          return this.adaptResponse(response, provider.type);
        } catch (err) {
          const durationMs = Date.now() - startTime;
          this.logLatency(provider.type, model, startTime, durationMs, false);
          throw err;
        }
      },
      messages,
      options,
    );
  }

  /**
   * Gọi mô hình chat streaming, tự động định tuyến và chuẩn hóa dữ liệu chunk
   */
  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk> {
    // Check budgets first
    const currentSessionCost = this.fallbackManager.getSessionTotalCost();
    const maxSessionCost = (this.fallbackManager as unknown as Record<string, unknown>)
      .budgetConfig as {
      maxCostPerSession: number;
      maxCostPerDay: number;
      alertThresholdPercent: number;
    };
    if (currentSessionCost >= maxSessionCost.maxCostPerSession) {
      throw new Error(
        `[BudgetExceeded] Session cost limit ($${maxSessionCost.maxCostPerSession}) reached. Current: $${currentSessionCost.toFixed(4)}`,
      );
    }

    const currentDayCost = this.fallbackManager.getDayTotalCost();
    const maxDayCost = (this.fallbackManager as unknown as Record<string, unknown>)
      .budgetConfig as {
      maxCostPerSession: number;
      maxCostPerDay: number;
      alertThresholdPercent: number;
    };
    if (currentDayCost >= maxDayCost.maxCostPerDay) {
      throw new Error(
        `[BudgetExceeded] Daily cost limit ($${maxDayCost.maxCostPerDay}) reached. Current: $${currentDayCost.toFixed(4)}`,
      );
    }

    const requestedModel = options?.model;
    const fallbackManagerInternal = this.fallbackManager as unknown as {
      sessionId: string;
      fallbackChain: string[];
    };
    const chain = requestedModel
      ? [
          requestedModel,
          ...fallbackManagerInternal.fallbackChain.filter((m: string) => m !== requestedModel),
        ]
      : fallbackManagerInternal.fallbackChain;

    let success = false;
    let accumulatedContent = '';
    let finalModel = '';
    let responsePromptTokens = 0;

    for (const model of chain) {
      const resolvedOptions = { ...options, model };
      const provider = this.resolveProvider(resolvedOptions);
      const adaptedMessages = this.adaptPrompts(messages, provider.type);
      const startTime = Date.now();
      const updatedOptions = this.injectKeepAlive(resolvedOptions, provider.type);

      try {
        const stream = provider.chatStream(adaptedMessages, updatedOptions);
        let isFirstChunk = true;

        for await (const chunk of stream) {
          if (isFirstChunk) {
            const durationMs = Date.now() - startTime;
            this.logLatency(provider.type, chunk.model || model, startTime, durationMs, true);
            isFirstChunk = false;
            finalModel = chunk.model || model;
          }
          accumulatedContent += chunk.content || '';
          yield this.adaptChunk(chunk, provider.type);
        }

        success = true;
        responsePromptTokens = this.fallbackManager.countMessagesTokens(messages);

        // Log cost for successful stream
        const responseCompletionTokens = this.fallbackManager.countTokens(accumulatedContent);
        const cost = this.fallbackManager.calculateCost(
          finalModel,
          responsePromptTokens,
          responseCompletionTokens,
        );

        this.fallbackManager.logCost({
          sessionId: (this.fallbackManager as unknown as { sessionId: string }).sessionId,
          provider: options?.agentRole || 'unknown-provider-stream',
          model: finalModel,
          promptTokens: responsePromptTokens,
          completionTokens: responseCompletionTokens,
          totalTokens: responsePromptTokens + responseCompletionTokens,
          cost,
          success: 1,
        });

        break; // Stream succeeded, break the failover loop
      } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        this.logLatency(provider.type, model, startTime, durationMs, false);

        // Log failed stream attempt
        this.fallbackManager.logCost({
          sessionId: (this.fallbackManager as unknown as { sessionId: string }).sessionId,
          provider: options?.agentRole || 'unknown-provider-stream',
          model,
          promptTokens: this.fallbackManager.countMessagesTokens(messages),
          completionTokens: 0,
          totalTokens: this.fallbackManager.countMessagesTokens(messages),
          cost: 0,
          success: 0,
          errorMessage: err instanceof Error ? err.message : String(err),
        });

        console.error(
          `🔴 STREAM FAILOVER: Model ${model} failed. Error: ${err instanceof Error ? err.message : String(err)}. Switching fallback...`,
        );
      }
    }

    if (!success) {
      // Local Ollama fallback for stream
      const localModel = 'ollama/qwen2.5-coder:1.5b';
      const resolvedOptions = { ...options, model: localModel };
      const provider = this.resolveProvider(resolvedOptions);
      const adaptedMessages = this.adaptPrompts(messages, provider.type);
      const startTime = Date.now();
      const updatedOptions = this.injectKeepAlive(resolvedOptions, provider.type);

      try {
        const stream = provider.chatStream(adaptedMessages, updatedOptions);
        let isFirstChunk = true;

        for await (const chunk of stream) {
          if (isFirstChunk) {
            const durationMs = Date.now() - startTime;
            this.logLatency(provider.type, chunk.model || localModel, startTime, durationMs, true);
            isFirstChunk = false;
            finalModel = chunk.model || localModel;
          }
          accumulatedContent += chunk.content || '';
          yield this.adaptChunk(chunk, provider.type);
        }

        const responseCompletionTokens = this.fallbackManager.countTokens(accumulatedContent);
        this.fallbackManager.logCost({
          sessionId: (this.fallbackManager as unknown as { sessionId: string }).sessionId,
          provider: options?.agentRole || 'ollama-fallback-stream',
          model: finalModel,
          promptTokens: this.fallbackManager.countMessagesTokens(messages),
          completionTokens: responseCompletionTokens,
          totalTokens:
            this.fallbackManager.countMessagesTokens(messages) + responseCompletionTokens,
          cost: 0,
          success: 1,
        });
      } catch (err: unknown) {
        throw new Error(
          `All remote and local Ollama streaming providers failed. Last error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async embed(text: string, options?: { model?: string }): Promise<EmbeddingResponse> {
    const provider = this.resolveProvider({ model: options?.model });
    return await provider.embed(text, options);
  }

  async embedMany(texts: string[], options?: { model?: string }): Promise<EmbeddingManyResponse> {
    const provider = this.resolveProvider({ model: options?.model });
    return await provider.embedMany(texts, options);
  }

  /**
   * Ghi vết thời gian phản hồi của các mô hình
   */
  private logLatency(
    provider: AIProviderType,
    model: string,
    startTime: number,
    durationMs: number,
    success: boolean,
  ): void {
    this.latencyHistory.push({ provider, model, startTime, durationMs, success });
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift(); // Keep last 100 entries
    }
  }

  public getLatencyMetrics(): LatencyMetric[] {
    return [...this.latencyHistory];
  }

  /**
   * Giải quyết provider dựa trên options model, agentRole hoặc cấu hình mặc định
   */
  public resolveProvider(options?: ChatOptions): AIProvider {
    let resolvedType: AIProviderType | null = null;

    if (options?.model) {
      const parts = options.model.split('/');
      const key = parts[0] ? parts[0].toLowerCase() : '';
      if (this.registry.has(key as AIProviderType)) {
        resolvedType = key as AIProviderType;
      } else if (options.model.includes('gpt') || options.model.includes('o1')) {
        resolvedType = 'openai';
      } else if (options.model.includes('claude')) {
        resolvedType = 'anthropic';
      } else if (options.model.includes('gemini')) {
        resolvedType = 'google';
      } else if (options.model.includes('deepseek')) {
        resolvedType = 'deepseek';
      }

      if (resolvedType && !this.registry.has(resolvedType)) {
        resolvedType = null;
      }
    }

    if (!resolvedType && options?.agentRole) {
      // Định tuyến thông minh theo vai trò
      if (options.agentRole === 'Plan') resolvedType = 'anthropic';
      else if (options.agentRole === 'Explore') resolvedType = 'openai';
      else if (options.agentRole === 'UI') resolvedType = 'google';

      if (resolvedType && !this.registry.has(resolvedType)) {
        resolvedType = null;
      }
    }

    if (!resolvedType && this.registry.has(this.defaultProvider)) {
      resolvedType = this.defaultProvider;
    }

    if (!resolvedType) {
      for (const type of this.fallbackOrder) {
        if (this.registry.has(type)) {
          resolvedType = type;
          break;
        }
      }
    }

    if (!resolvedType) {
      const all = this.registry.getAll();
      const first = all[0];
      if (first) return first;
      throw new Error('UnifiedRouter has no active providers registered.');
    }

    const provider = this.registry.get(resolvedType);
    if (!provider) throw new Error(`Provider ${resolvedType} not found in registry.`);
    return provider;
  }

  private getPrimaryProvider(): AIProvider {
    return this.resolveProvider();
  }

  /**
   * Bọc/định dạng system prompt hoặc tin nhắn phù hợp với đích đến từng mô hình (Prompt Adapter)
   */
  private adaptPrompts(messages: ChatMessage[], providerType: AIProviderType): ChatMessage[] {
    // Với DeepSeek R1 hoặc các mô hình cụ thể đòi hỏi bọc cấu trúc đặc biệt
    if (providerType === 'deepseek') {
      return messages.map((msg) => {
        if (msg.role === 'system') {
          // Bọc chỉ dẫn suy luận cho DeepSeek
          return {
            role: 'system',
            content: `${msg.content}\nPlease output your step-by-step thinking process between <think> and </think> tags.`,
          };
        }
        return msg;
      });
    }

    return messages;
  }

  /**
   * Chuẩn hóa và làm sạch Response nhận được từ LLM API
   */
  private adaptResponse(response: ChatResponse, providerType: AIProviderType): ChatResponse {
    if (providerType === 'deepseek') {
      // Trích xuất hoặc chuẩn hóa phần suy luận nếu nằm ngoài content chính
      return response;
    }
    return response;
  }

  /**
   * Chuẩn hóa chunk đầu ra khi streaming
   */
  private adaptChunk(chunk: AIStreamChunk, providerType: AIProviderType): AIStreamChunk {
    // Đảm bảo luôn gán đúng provider và model trong chunk đầu ra
    return {
      ...chunk,
      provider: chunk.provider || providerType,
    };
  }

  /**
   * Chèn cấu hình keep-alive cho cuộc gọi
   */
  private injectKeepAlive(
    options: ChatOptions | undefined,
    providerType: AIProviderType,
  ): ChatOptions | undefined {
    // Chèn agent của unified router để giữ kết nối ổ định
    const agent = providerType === 'ollama' ? this.httpAgent : this.httpsAgent;
    return {
      ...options,
      agent, // Sẽ được adapter của provider bóc tách và chèn vào fetch options nếu được hỗ trợ
    } as Record<string, unknown> as ChatOptions;
  }
}
