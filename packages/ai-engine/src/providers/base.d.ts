import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type { AIProvider, ChatMessage, ChatOptions, ChatResponse, ProviderConfig, EmbeddingResponse, EmbeddingManyResponse } from '../types.js';
export declare abstract class BaseProvider implements AIProvider {
    abstract readonly type: AIProviderType;
    abstract readonly name: string;
    abstract readonly defaultModel: string;
    abstract readonly models: string[];
    protected config: ProviderConfig;
    constructor(config: ProviderConfig);
    abstract isReady(): Promise<boolean>;
    abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    abstract chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
    test(): Promise<boolean>;
    protected getModel(options?: ChatOptions): string;
    protected getMaxTokens(options?: ChatOptions): number;
    protected getTemperature(options?: ChatOptions): number;
    protected getApiKey(): string;
    protected getBaseUrl(): string | undefined;
    embed(_text: string, _options?: {
        model?: string;
    }): Promise<EmbeddingResponse>;
    embedMany(_texts: string[], _options?: {
        model?: string;
    }): Promise<EmbeddingManyResponse>;
    generateImage(_prompt: string, _options?: any): Promise<{
        url: string;
        b64?: string;
    }>;
    generateSpeech(_text: string, _options?: any): Promise<{
        audio: Buffer;
        contentType: string;
    }>;
    generateVideo(_prompt: string, _options?: any): Promise<{
        url: string;
    }>;
    transcribe(_audio: Buffer, _options?: any): Promise<{
        text: string;
    }>;
}
//# sourceMappingURL=base.d.ts.map