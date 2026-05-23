// ==============================================================================
// GHITA CODING AGENT - Base Provider
// ==============================================================================

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
import { AIUnsupportedFeatureError } from '../errors/index.js';

export abstract class BaseProvider implements AIProvider {
  abstract readonly type: AIProviderType;
  abstract readonly name: string;
  abstract readonly defaultModel: string;
  abstract readonly models: string[];

  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract isReady(): Promise<boolean>;
  abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  abstract chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<AIStreamChunk>;

  async test(): Promise<boolean> {
    try {
      const response = await this.chat([{ role: 'user', content: 'Hello' }], {
        maxTokens: 10,
      });
      return response.content.length > 0;
    } catch {
      return false;
    }
  }

  protected getModel(options?: ChatOptions): string {
    return options?.model || this.config.defaultModel || this.defaultModel;
  }

  protected getMaxTokens(options?: ChatOptions): number {
    return options?.maxTokens || this.config.maxTokens || 4096;
  }

  protected getTemperature(options?: ChatOptions): number {
    return options?.temperature ?? this.config.temperature ?? 0.7;
  }

  protected getApiKey(): string {
    if (!this.config.apiKey) {
      throw new Error(`${this.name}: API key not configured`);
    }
    return this.config.apiKey;
  }

  protected getBaseUrl(): string | undefined {
    return this.config.baseUrl;
  }

  async embed(_text: string, _options?: { model?: string }): Promise<EmbeddingResponse> {
    throw new AIUnsupportedFeatureError(this.name, 'embed');
  }

  async embedMany(_texts: string[], _options?: { model?: string }): Promise<EmbeddingManyResponse> {
    throw new AIUnsupportedFeatureError(this.name, 'embedMany');
  }

  async generateImage(_prompt: string, _options?: any): Promise<{ url: string; b64?: string }> {
    throw new AIUnsupportedFeatureError(this.name, 'generateImage');
  }

  async generateSpeech(_text: string, _options?: any): Promise<{ audio: Buffer; contentType: string }> {
    throw new AIUnsupportedFeatureError(this.name, 'generateSpeech');
  }

  async generateVideo(_prompt: string, _options?: any): Promise<{ url: string }> {
    throw new AIUnsupportedFeatureError(this.name, 'generateVideo');
  }

  async transcribe(_audio: Buffer, _options?: any): Promise<{ text: string }> {
    throw new AIUnsupportedFeatureError(this.name, 'transcribe');
  }
}
