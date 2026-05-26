import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse, ProviderConfig } from '../types.js';
import { BaseProvider } from './base.js';
export declare class CustomProvider extends BaseProvider {
    readonly type: AIProviderType;
    readonly name: string;
    readonly defaultModel: string;
    readonly models: string[];
    constructor(config: ProviderConfig);
    isReady(): Promise<boolean>;
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
}
//# sourceMappingURL=custom.d.ts.map