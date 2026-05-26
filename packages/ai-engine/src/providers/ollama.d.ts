import type { AIStreamChunk } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse, ProviderConfig, EmbeddingResponse, EmbeddingManyResponse } from '../types.js';
import { BaseProvider } from './base.js';
export declare class OllamaProvider extends BaseProvider {
    readonly type: "ollama";
    readonly name = "Ollama (Local)";
    readonly defaultModel = "llama3";
    readonly models: string[];
    constructor(config: ProviderConfig);
    private getOllamaUrl;
    isReady(): Promise<boolean>;
    /** Lấy danh sách models từ Ollama */
    listModels(): Promise<string[]>;
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
    embed(text: string, options?: {
        model?: string;
    }): Promise<EmbeddingResponse>;
    embedMany(texts: string[], options?: {
        model?: string;
    }): Promise<EmbeddingManyResponse>;
}
//# sourceMappingURL=ollama.d.ts.map