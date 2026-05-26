// ==============================================================================
// GHITA CODING AGENT - Provider Registry
// ==============================================================================

import type { AIProviderType } from '@ghita/shared';
import { AI_PROVIDERS } from '@ghita/shared';
import type { AIProvider, ProviderConfig } from './types.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GoogleProvider } from './providers/google.js';
import { OllamaProvider } from './providers/ollama.js';
import { CustomProvider } from './providers/custom.js';

export class ProviderRegistry {
  private providers = new Map<AIProviderType, AIProvider>();

  /** Đăng ký một provider */
  register(provider: AIProvider): void {
    this.providers.set(provider.type, provider);
  }

  /** Tạo và đăng ký provider từ config */
  registerFromConfig(config: ProviderConfig): AIProvider {
    const provider = this.createProvider(config);
    this.register(provider);
    return provider;
  }

  /** Lấy provider theo type */
  get(type: AIProviderType): AIProvider | undefined {
    return this.providers.get(type);
  }

  /** Lấy tất cả providers */
  getAll(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /** Lấy tất cả provider types đã đăng ký */
  getTypes(): AIProviderType[] {
    return Array.from(this.providers.keys());
  }

  /** Kiểm tra provider đã đăng ký chưa */
  has(type: AIProviderType): boolean {
    return this.providers.has(type);
  }

  /** Xoá provider */
  remove(type: AIProviderType): boolean {
    return this.providers.delete(type);
  }

  /** Xoá tất cả */
  clear(): void {
    this.providers.clear();
  }

  /** Lấy status của tất cả providers */
  async getStatus(): Promise<
    Array<{ type: AIProviderType; name: string; ready: boolean }>
  > {
    const results: Array<{ type: AIProviderType; name: string; ready: boolean }> = [];
    for (const provider of this.providers.values()) {
      results.push({
        type: provider.type,
        name: provider.name,
        ready: await provider.isReady(),
      });
    }
    return results;
  }

  private createProvider(config: ProviderConfig): AIProvider {
    switch (config.type) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'google':
        return new GoogleProvider(config);
      case 'ollama':
        return new OllamaProvider(config);
      case 'custom':
        return new CustomProvider(config);
      // OpenAI-compatible providers (reuse CustomProvider)
      // Phase 1.2 providers use the same path.
      case 'opengateway':
      case 'mimo':
      case 'openrouter':
      case 'deepseek':
      case 'groq':
      case 'mistral':
      case 'hicap':
      case 'github-models':
      case 'cerebras':
      case 'together':
      case 'fireworks':
      case 'cohere':
      case 'xai':
      case 'replicate':
      case 'perplexity':
      case 'voyage':
      case 'ai21':
      case 'sambanova':
      case 'novita':
        return new CustomProvider({
          ...config,
          providerType: config.type,
          providerName: AI_PROVIDERS[config.type]?.name ?? config.type,
        });
      default:
        throw new Error(`Unknown provider type: ${config.type as string}`);
    }
  }
}
