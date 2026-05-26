import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type { AIProvider, ChatMessage, ChatOptions, ChatResponse, EmbeddingResponse, EmbeddingManyResponse } from '../types.js';
import { ProviderRegistry } from '../registry.js';
import { FallbackManager } from '../gateway/fallbackManager.js';
export interface UnifiedRouterOptions {
    registry?: ProviderRegistry;
    defaultProvider?: AIProviderType;
    fallbackOrder?: AIProviderType[];
    encryptionKey?: string;
    modelsConfigPath?: string;
    dbPath?: string;
    budgetConfigPath?: string;
}
export interface LatencyMetric {
    provider: AIProviderType;
    model: string;
    startTime: number;
    durationMs: number;
    success: boolean;
}
export declare class UnifiedRouter implements AIProvider {
    readonly type: "custom";
    readonly name = "UnifiedRouterGateway";
    private registry;
    private defaultProvider;
    private fallbackOrder;
    private encryptionKey;
    private configPath;
    private latencyHistory;
    fallbackManager: FallbackManager;
    private readonly httpsAgent;
    private readonly httpAgent;
    constructor(options?: UnifiedRouterOptions);
    get defaultModel(): string;
    get models(): string[];
    /**
     * Tải và phân tích cấu hình từ file .ghita/models.yaml
     */
    loadConfig(): void;
    /**
     * Phân tích cú pháp YAML đơn giản không dùng thư viện ngoài
     */
    private parseSimpleYaml;
    private loadFromEnv;
    isReady(): Promise<boolean>;
    test(): Promise<boolean>;
    /**
     * Gọi mô hình chat đồng bộ (không streaming) kèm theo theo dõi độ trễ và định dạng prompt
     */
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    /**
     * Gọi mô hình chat streaming, tự động định tuyến và chuẩn hóa dữ liệu chunk
     */
    chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
    embed(text: string, options?: {
        model?: string;
    }): Promise<EmbeddingResponse>;
    embedMany(texts: string[], options?: {
        model?: string;
    }): Promise<EmbeddingManyResponse>;
    /**
     * Ghi vết thời gian phản hồi của các mô hình
     */
    private logLatency;
    getLatencyMetrics(): LatencyMetric[];
    /**
     * Giải quyết provider dựa trên options model, agentRole hoặc cấu hình mặc định
     */
    resolveProvider(options?: ChatOptions): AIProvider;
    private getPrimaryProvider;
    /**
     * Bọc/định dạng system prompt hoặc tin nhắn phù hợp với đích đến từng mô hình (Prompt Adapter)
     */
    private adaptPrompts;
    /**
     * Chuẩn hóa và làm sạch Response nhận được từ LLM API
     */
    private adaptResponse;
    /**
     * Chuẩn hóa chunk đầu ra khi streaming
     */
    private adaptChunk;
    /**
     * Chèn cấu hình keep-alive cho cuộc gọi
     */
    private injectKeepAlive;
}
//# sourceMappingURL=unifiedRouter.d.ts.map