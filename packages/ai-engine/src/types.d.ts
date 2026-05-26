import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
export interface PermissionContext {
    cwd?: string;
    filePath?: string;
    command?: string;
    stepIndex?: number;
    [key: string]: any;
}
export interface AIProvider {
    readonly type: AIProviderType;
    readonly name: string;
    readonly defaultModel: string;
    readonly models: string[];
    /** Kiểm tra provider đã sẵn sàng chưa (có API key, kết nối được không) */
    isReady(): Promise<boolean>;
    /** Gửi message và nhận response (non-streaming) */
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    /** Gửi message và nhận streaming response */
    chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
    /** Test kết nối provider */
    test(): Promise<boolean>;
    /** Tạo vector embedding cho một chuỗi text */
    embed(text: string, options?: {
        model?: string;
    }): Promise<EmbeddingResponse>;
    /** Tạo vector embedding cho danh sách các chuỗi text */
    embedMany(texts: string[], options?: {
        model?: string;
    }): Promise<EmbeddingManyResponse>;
    /** Sinh ảnh từ văn bản */
    generateImage?(prompt: string, options?: any): Promise<{
        url: string;
        b64?: string;
    }>;
    /** Chuyển văn bản thành giọng nói */
    generateSpeech?(text: string, options?: any): Promise<{
        audio: Buffer;
        contentType: string;
    }>;
    /** Sinh video từ văn bản */
    generateVideo?(prompt: string, options?: any): Promise<{
        url: string;
    }>;
    /** Chuyển giọng nói/âm thanh thành văn bản */
    transcribe?(audio: Buffer, options?: any): Promise<{
        text: string;
    }>;
}
export type ChatRole = 'user' | 'assistant' | 'system';
export interface ChatMessage {
    role: ChatRole;
    content: string;
}
export interface ChatOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stop?: string[];
    signal?: AbortSignal;
    agentRole?: 'Explore' | 'Plan' | 'UI' | 'default';
}
export interface ChatResponse {
    content: string;
    model: string;
    provider: AIProviderType;
    usage: TokenUsage;
    finishReason: 'stop' | 'length' | 'error' | 'aborted';
}
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
export interface ProviderConfig {
    type: AIProviderType;
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
    maxTokens?: number;
    temperature?: number;
    /** Override type identity for custom-compatible providers (e.g. 'deepseek', 'groq') */
    providerType?: AIProviderType;
    /** Override display name for custom-compatible providers */
    providerName?: string;
}
export interface MCPServerEntry {
    name: string;
    command?: string;
    args?: string[];
    url?: string;
    transport: 'stdio' | 'sse';
    env?: Record<string, string>;
    enabled: boolean;
}
export interface OrchestratorConfig {
    providers: ProviderConfig[];
    defaultProvider?: AIProviderType;
    fallbackOrder?: AIProviderType[];
    retryAttempts?: number;
    retryDelayMs?: number;
    routing?: {
        Explore?: string;
        Plan?: string;
        UI?: string;
        default?: string;
        [key: string]: string | undefined;
    };
    mcpServers?: MCPServerEntry[];
    costLimitUsd?: number;
    qdrantUrl?: string;
    collectionName?: string;
    cacheThreshold?: number;
}
export interface OrchestratorStatus {
    availableProviders: AIProviderType[];
    defaultProvider: AIProviderType | null;
    totalProviders: number;
    readyProviders: number;
}
export interface EmbeddingResponse {
    embedding: number[];
    model: string;
    provider: AIProviderType;
    usage?: {
        promptTokens: number;
        totalTokens: number;
    };
}
export interface EmbeddingManyResponse {
    embeddings: number[][];
    model: string;
    provider: AIProviderType;
    usage?: {
        promptTokens: number;
        totalTokens: number;
    };
}
//# sourceMappingURL=types.d.ts.map