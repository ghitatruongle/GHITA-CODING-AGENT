import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type { AIProvider, ChatMessage, ChatOptions, ChatResponse, EmbeddingResponse, EmbeddingManyResponse } from '../types.js';
import { ProviderRegistry } from '../registry.js';
export interface UniversalChatModelOptions {
    registry?: ProviderRegistry;
    defaultProvider?: AIProviderType;
    fallbackOrder?: AIProviderType[];
    retryAttempts?: number;
    retryDelayMs?: number;
    routing?: Record<string, AIProviderType>;
}
export declare class UniversalChatModel implements AIProvider {
    private registry;
    private defaultProvider;
    private fallbackOrder;
    private retryAttempts;
    private retryDelayMs;
    private routing;
    constructor(options?: UniversalChatModelOptions);
    get type(): AIProviderType;
    get name(): string;
    get defaultModel(): string;
    get models(): string[];
    isReady(): Promise<boolean>;
    test(): Promise<boolean>;
    private mapModelKeyToProviderType;
    resolveProvider(options?: ChatOptions): AIProvider;
    private cleanOptions;
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
    embed(text: string, options?: {
        model?: string;
    }): Promise<EmbeddingResponse>;
    embedMany(texts: string[], options?: {
        model?: string;
    }): Promise<EmbeddingManyResponse>;
    private findFallbackProvider;
    private executeWithFallback;
}
//# sourceMappingURL=universal.d.ts.map