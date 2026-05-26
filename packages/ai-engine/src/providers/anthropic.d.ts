import type { AIStreamChunk } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse, ProviderConfig } from '../types.js';
import { BaseProvider } from './base.js';
export declare class AnthropicProvider extends BaseProvider {
    readonly type: "anthropic";
    readonly name = "Anthropic";
    readonly defaultModel = "claude-sonnet-4-20250514";
    readonly models: string[];
    constructor(config: ProviderConfig);
    isReady(): Promise<boolean>;
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
    private mapFinishReason;
}
//# sourceMappingURL=anthropic.d.ts.map