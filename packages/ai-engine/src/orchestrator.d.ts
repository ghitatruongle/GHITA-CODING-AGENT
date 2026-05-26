import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse, OrchestratorConfig, OrchestratorStatus, EmbeddingResponse, EmbeddingManyResponse } from './types.js';
import { ProviderRegistry } from './registry.js';
import { MCPClient } from './mcp/client.js';
import type { MCPTool, MCPToolResult } from './mcp/types.js';
import { HookRunner } from './hooks/runner.js';
import type { HookConfig, HookResult } from './hooks/types.js';
import { type BuiltInTool } from './tools/index.js';
import { ContextManager } from './context/manager.js';
import { PermissionManager } from './security/permissions.js';
import { z } from 'zod';
import { type GenerateObjectResponse } from './utils/structured.js';
import { SemanticCache } from './utils/cache.js';
import { CostTracker, BudgetManager } from './utils/cost.js';
export declare class Orchestrator {
    private registry;
    private config;
    private defaultProvider;
    private fallbackOrder;
    readonly mcpClient: MCPClient;
    readonly hookRunner: HookRunner;
    readonly builtInTools: BuiltInTool[];
    readonly contextManager: ContextManager;
    readonly permissionManager: PermissionManager;
    readonly costTracker: CostTracker;
    readonly budgetManager: BudgetManager;
    readonly semanticCache: SemanticCache;
    constructor(config: OrchestratorConfig);
    /** Lấy registry để truy cập providers trực tiếp */
    getRegistry(): ProviderRegistry;
    /** Chat với provider ưu tiên, fallback nếu lỗi */
    chat(messages: ChatMessage[], options?: ChatOptions & {
        provider?: AIProviderType;
    }): Promise<ChatResponse>;
    /** Chat streaming với provider ưu tiên, fallback nếu lỗi */
    chatStream(messages: ChatMessage[], options?: ChatOptions & {
        provider?: AIProviderType;
    }): AsyncGenerator<AIStreamChunk>;
    /** Tạo cấu trúc đầu ra (structured output) theo schema của Zod */
    generateObject<T>(schema: z.ZodType<T>, messages: ChatMessage[], options?: ChatOptions & {
        provider?: AIProviderType;
    }): Promise<GenerateObjectResponse<T>>;
    /** Tạo vector embedding cho một chuỗi text */
    embed(text: string, options?: {
        model?: string;
        provider?: AIProviderType;
    }): Promise<EmbeddingResponse>;
    /** Tạo vector embedding cho danh sách các chuỗi text */
    embedMany(texts: string[], options?: {
        model?: string;
        provider?: AIProviderType;
    }): Promise<EmbeddingManyResponse>;
    /** Sinh ảnh từ văn bản */
    generateImage(prompt: string, options?: any & {
        provider?: AIProviderType;
    }): Promise<{
        url: string;
        b64?: string;
    }>;
    /** Chuyển văn bản thành giọng nói */
    generateSpeech(text: string, options?: any & {
        provider?: AIProviderType;
    }): Promise<{
        audio: Buffer;
        contentType: string;
    }>;
    /** Sinh video từ văn bản */
    generateVideo(prompt: string, options?: any & {
        provider?: AIProviderType;
    }): Promise<{
        url: string;
    }>;
    /** Chuyển giọng nói thành văn bản */
    transcribe(audio: Buffer, options?: any & {
        provider?: AIProviderType;
    }): Promise<{
        text: string;
    }>;
    /** Test tất cả providers */
    testAll(): Promise<Array<{
        type: AIProviderType;
        ok: boolean;
        error?: string;
    }>>;
    /** Lấy status tổng quan */
    getStatus(): Promise<OrchestratorStatus>;
    /** Đổi default provider */
    setDefaultProvider(type: AIProviderType | null): void;
    /** Đổi fallback order */
    setFallbackOrder(order: AIProviderType[]): void;
    /** Lấy tất cả MCP tools */
    getMCPTools(): MCPTool[];
    /** Gọi MCP tool */
    callMCPTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult>;
    /** Load hooks config */
    loadHooks(hooks: HookConfig[]): void;
    /** Chạy pre-tool hooks */
    runPreToolHooks(toolName: string, toolArgs?: Record<string, unknown>): Promise<HookResult[]>;
    /** Chạy post-tool hooks */
    runPostToolHooks(toolName: string, toolArgs?: Record<string, unknown>, toolResult?: string): Promise<HookResult[]>;
    /** Lấy built-in tool theo tên */
    getBuiltInTool(name: string): BuiltInTool | undefined;
    /** Gọi built-in tool */
    callBuiltInTool(name: string, args: Record<string, unknown>): Promise<string>;
    /** Kiểm tra context có cần compact không */
    needsContextCompact(messages: ChatMessage[]): boolean;
    /** Compact messages */
    compactContext(messages: ChatMessage[]): ChatMessage[];
    /** Lấy context usage */
    getContextUsage(messages: ChatMessage[]): {
        used: number;
        max: number;
        percentage: number;
    };
    private mapModelKeyToProviderType;
    private resolveProvider;
    private findFallbackProvider;
    private executeWithFallback;
}
//# sourceMappingURL=orchestrator.d.ts.map