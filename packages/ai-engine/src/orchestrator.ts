// ==============================================================================
// GHITA CODING AGENT - AI Orchestrator
// ==============================================================================

import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import { retry } from '@ghita/shared';
import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  OrchestratorConfig,
  OrchestratorStatus,
} from './types.js';
import { ProviderRegistry } from './registry.js';

export class Orchestrator {
  private registry: ProviderRegistry;
  private config: OrchestratorConfig;
  private defaultProvider: AIProviderType | null = null;
  private fallbackOrder: AIProviderType[] = [];

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.registry = new ProviderRegistry();

    // Đăng ký tất cả providers từ config
    for (const providerConfig of config.providers) {
      this.registry.registerFromConfig(providerConfig);
    }

    this.defaultProvider = config.defaultProvider ?? null;
    this.fallbackOrder = config.fallbackOrder ?? [];
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
    const provider = this.resolveProvider(options?.provider);
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
    const provider = this.resolveProvider(options?.provider);

    try {
      yield* provider.chatStream(messages, options);
    } catch (error) {
      // Fallback cho streaming
      const fallback = this.findFallbackProvider(provider.type);
      if (fallback) {
        yield* fallback.chatStream(messages, options);
      } else {
        throw error;
      }
    }
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

  // --- Private ---

  private resolveProvider(preferred?: AIProviderType): AIProvider {
    // Ưu tiên: preferred > defaultProvider > fallback đầu tiên > bất kỳ sẵn sàng
    if (preferred) {
      const p = this.registry.get(preferred);
      if (p) return p;
    }

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
