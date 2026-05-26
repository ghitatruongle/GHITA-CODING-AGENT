import type { AIStreamChunk } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse, ProviderConfig, EmbeddingResponse, EmbeddingManyResponse } from '../types.js';
import { BaseProvider } from './base.js';
export declare class OpenAIProvider extends BaseProvider {
    readonly type: "openai";
    readonly name = "OpenAI";
    readonly defaultModel = "gpt-4o";
    readonly models: string[];
    constructor(config: ProviderConfig);
    isReady(): Promise<boolean>;
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
    private mapFinishReason;
    embed(text: string, options?: {
        model?: string;
    }): Promise<EmbeddingResponse>;
    embedMany(texts: string[], options?: {
        model?: string;
    }): Promise<EmbeddingManyResponse>;
    generateImage(prompt: string, options?: any): Promise<{
        url: string;
        b64?: string;
    }>;
    generateSpeech(text: string, options?: any): Promise<{
        audio: Buffer;
        contentType: string;
    }>;
    transcribe(audio: Buffer, options?: any): Promise<{
        text: string;
    }>;
}
//# sourceMappingURL=openai.d.ts.map