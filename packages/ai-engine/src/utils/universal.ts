// ==============================================================================
// GHITA CODING AGENT - Universal Chat Model Router (STT 2.9)
// ==============================================================================

import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import { retry, sleep } from '@ghita/shared';
import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  EmbeddingResponse,
  EmbeddingManyResponse,
} from '../types.js';
import { ProviderRegistry } from '../registry.js';

export interface UniversalChatModelOptions {
  registry?: ProviderRegistry;
  defaultProvider?: AIProviderType;
  fallbackOrder?: AIProviderType[];
  retryAttempts?: number;
  retryDelayMs?: number;
  routing?: Record<string, AIProviderType>;
}

export class UniversalChatModel implements AIProvider {
  private registry: ProviderRegistry;
  private defaultProvider: AIProviderType | null = null;
  private fallbackOrder: AIProviderType[] = [];
  private retryAttempts: number;
  private retryDelayMs: number;
  private routing: Record<string, AIProviderType> = {};

  constructor(options: UniversalChatModelOptions = {}) {
    this.registry = options.registry || new ProviderRegistry();
    this.defaultProvider = options.defaultProvider ?? null;
    this.fallbackOrder = options.fallbackOrder ?? [];
    this.retryAttempts = options.retryAttempts ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.routing = options.routing || {};
  }

  get type(): AIProviderType {
    const prov = this.resolveProvider();
    return prov.type;
  }

  get name(): string {
    const prov = this.resolveProvider();
    return `UniversalChatModel(${prov.name})`;
  }

  get defaultModel(): string {
    const prov = this.resolveProvider();
    return prov.defaultModel;
  }

  get models(): string[] {
    const prov = this.resolveProvider();
    return prov.models;
  }

  async isReady(): Promise<boolean> {
    try {
      const prov = this.resolveProvider();
      return await prov.isReady();
    } catch {
      return false;
    }
  }

  async test(): Promise<boolean> {
    try {
      const prov = this.resolveProvider();
      return await prov.test();
    } catch {
      return false;
    }
  }

  private mapModelKeyToProviderType(modelKey: string): AIProviderType | null {
    const key = modelKey.toLowerCase();
    const allTypes: AIProviderType[] = [
      'openai',
      'anthropic',
      'google',
      'ollama',
      'custom',
      'opengateway',
      'mimo',
      'openrouter',
      'deepseek',
      'groq',
      'mistral',
      'hicap',
      'github-models',
    ];
    for (const type of allTypes) {
      if (key === type || key.startsWith(type + '/') || key.includes(type)) return type;
    }

    if (key.includes('gpt') || key.includes('o1') || key.includes('o3')) return 'openai';
    if (key.includes('claude')) return 'anthropic';
    if (key.includes('gemini')) return 'google';
    if (key.includes('llama') || key.includes('mistral') || key.includes('mixtral'))
      return 'custom';
    return null;
  }

  public resolveProvider(options?: ChatOptions): AIProvider {
    let resolvedType: AIProviderType | null = null;

    // 1. Resolve from options.model (e.g. "openai/gpt-4o" or just "gpt-4o")
    if (options?.model) {
      const parts = options.model.split('/');
      if (parts.length > 1) {
        const potentialType = this.mapModelKeyToProviderType(parts[0] ?? '');
        if (potentialType && this.registry.has(potentialType)) {
          resolvedType = potentialType;
        }
      } else {
        const potentialType = this.mapModelKeyToProviderType(options.model);
        if (potentialType && this.registry.has(potentialType)) {
          resolvedType = potentialType;
        }
      }
    }

    // 2. Resolve from options.agentRole and routing map
    if (!resolvedType && options?.agentRole && this.routing[options.agentRole]) {
      resolvedType = this.routing[options.agentRole] ?? null;
    }

    // 3. Fallback to defaultProvider
    if (!resolvedType && this.defaultProvider && this.registry.has(this.defaultProvider)) {
      resolvedType = this.defaultProvider;
    }

    // 4. Fallback to fallbackOrder
    if (!resolvedType && this.fallbackOrder.length > 0) {
      for (const type of this.fallbackOrder) {
        if (this.registry.has(type)) {
          resolvedType = type;
          break;
        }
      }
    }

    // 5. Take first registered provider
    if (!resolvedType) {
      const all = this.registry.getAll();
      const first = all[0];
      if (first) {
        return first;
      }
      throw new Error('UniversalChatModel has no providers registered');
    }

    const provider = this.registry.get(resolvedType);
    if (!provider) {
      throw new Error(`Provider for type "${resolvedType}" resolved but not found in registry`);
    }

    return provider;
  }

  private cleanOptions(options?: ChatOptions): ChatOptions | undefined {
    if (!options) return undefined;
    if (options.model && options.model.includes('/')) {
      const parts = options.model.split('/');
      return {
        ...options,
        model: parts.slice(1).join('/'),
      };
    }
    return options;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const provider = this.resolveProvider(options);
    const cleanedOpts = this.cleanOptions(options);

    return await this.executeWithFallback(
      (p) => p.chat(messages, cleanedOpts),
      provider,
      cleanedOpts,
    );
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk> {
    const provider = this.resolveProvider(options);
    const cleanedOpts = this.cleanOptions(options);

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        yield* provider.chatStream(messages, cleanedOpts);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.retryAttempts) {
          await sleep(this.retryDelayMs);
        }
      }
    }

    // Try fallback
    const fallback = this.findFallbackProvider(provider.type);
    if (fallback) {
      try {
        yield* fallback.chatStream(messages, cleanedOpts);
        return;
      } catch {
        throw lastError;
      }
    }
    throw lastError;
  }

  async embed(text: string, options?: { model?: string }): Promise<EmbeddingResponse> {
    const dummyOpts: ChatOptions = { model: options?.model };
    const provider = this.resolveProvider(dummyOpts);

    let cleanedModel = options?.model;
    if (cleanedModel && cleanedModel.includes('/')) {
      cleanedModel = cleanedModel.split('/').slice(1).join('/');
    }

    return await this.executeWithFallback(
      (p) => p.embed(text, { model: cleanedModel }),
      provider,
      dummyOpts,
    );
  }

  async embedMany(texts: string[], options?: { model?: string }): Promise<EmbeddingManyResponse> {
    const dummyOpts: ChatOptions = { model: options?.model };
    const provider = this.resolveProvider(dummyOpts);

    let cleanedModel = options?.model;
    if (cleanedModel && cleanedModel.includes('/')) {
      cleanedModel = cleanedModel.split('/').slice(1).join('/');
    }

    return await this.executeWithFallback(
      (p) => p.embedMany(texts, { model: cleanedModel }),
      provider,
      dummyOpts,
    );
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
    _options?: ChatOptions,
  ): Promise<T> {
    try {
      return await retry(() => fn(primary), this.retryAttempts, this.retryDelayMs);
    } catch (primaryError) {
      const fallback = this.findFallbackProvider(primary.type);
      if (fallback) {
        try {
          return await fn(fallback);
        } catch {
          throw primaryError;
        }
      }
      throw primaryError;
    }
  }
}
