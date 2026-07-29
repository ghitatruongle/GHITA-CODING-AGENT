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
import { GroqProvider } from './providers/groq.js';
import { MistralProvider } from './providers/mistral.js';
// v0.4.9 A5: dedicated OpenAI-compatible + Azure providers
import { XAIProvider } from './providers/xai.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { TogetherProvider } from './providers/together.js';
import { PerplexityProvider } from './providers/perplexity.js';
import { AzureOpenAIProvider } from './providers/azure-openai.js';

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
  async getStatus(): Promise<Array<{ type: AIProviderType; name: string; ready: boolean }>> {
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
      // Phase 1: Dedicated Groq provider (ultra-fast LPU inference)
      case 'groq':
        return new GroqProvider(config);
      // Phase 1: Dedicated Mistral provider (La Plateforme API)
      case 'mistral':
        return new MistralProvider(config);
      // v0.4.9 A5: Dedicated providers (proper models + capabilities)
      case 'xai':
        return new XAIProvider(config);
      case 'openrouter':
        return new OpenRouterProvider(config);
      case 'together':
        return new TogetherProvider(config);
      case 'perplexity':
        return new PerplexityProvider(config);
      case 'azure-openai':
        return new AzureOpenAIProvider(config);
      // OpenAI-compatible providers (reuse CustomProvider)
      // Phase 1.2 providers use the same path.
      case 'opengateway':
      case 'mimo':
      case 'deepseek':
      case 'hicap':
      case 'github-models':
      case 'cerebras':
      case 'fireworks':
      case 'cohere':
      case 'replicate':
      case 'voyage':
      case 'ai21':
      case 'sambanova':
      case 'novita':
      case 'opencode-zen':
      case 'nvidia-nim':
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
