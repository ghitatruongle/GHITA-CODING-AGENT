export interface AgentSDKConfig {
    serverUrl?: string;
    apiKey?: string;
    timeout?: number;
}
export interface SendMessageOptions {
    provider?: string;
    agentRole?: string;
    maxTokens?: number;
    temperature?: number;
}
export interface AgentMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}
/**
 * GhitAgentClient — SDK cho developer xây dựng custom agents trên nền GHITA
 *
 * @example
 * ```ts
 * const client = new GhitAgentClient({ serverUrl: 'http://localhost:8080' });
 * const response = await client.sendMessage('Hello GHITA!');
 * console.log(response.content);
 * ```
 */
export declare class GhitAgentClient {
    private config;
    constructor(config?: AgentSDKConfig);
    /** Gửi message và nhận response */
    sendMessage(message: string, options?: SendMessageOptions): Promise<AgentMessage>;
    /** Kiểm tra server status */
    getStatus(): Promise<{
        status: string;
        version: string;
    }>;
    /** Lấy danh sách providers khả dụng */
    getProviders(): Promise<string[]>;
    /** Lấy danh sách subagents khả dụng */
    getSubagents(): Promise<any[]>;
    /** Kích hoạt vòng lặp tự sửa sai Ralph Loop cho một tác vụ */
    runRalphLoop(task: string, maxIterations?: number): Promise<any>;
}
//# sourceMappingURL=client.d.ts.map