import type { AIStreamChunk } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse, ProviderConfig, EmbeddingResponse, EmbeddingManyResponse } from '../types.js';
import { BaseProvider } from './base.js';
export declare class GoogleProvider extends BaseProvider {
    readonly type: "google";
    readonly name = "Google";
    readonly defaultModel = "gemini-1.5-pro";
    readonly models: string[];
    constructor(config: ProviderConfig);
    isReady(): Promise<boolean>;
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
    private convertMessages;
    private mapFinishReason;
    embed(text: string, options?: {
        model?: string;
    }): Promise<EmbeddingResponse>;
    embedMany(texts: string[], options?: {
        model?: string;
    }): Promise<EmbeddingManyResponse>;
}
//# sourceMappingURL=google.d.ts.map