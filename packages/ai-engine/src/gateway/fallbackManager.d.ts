import type { ChatMessage, ChatOptions, ChatResponse } from '../types.js';
export interface BudgetConfig {
    maxCostPerSession: number;
    maxCostPerDay: number;
    alertThresholdPercent: number;
}
export interface CostRecord {
    id: string;
    sessionId: string;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    success: number;
    errorMessage?: string;
    timestamp: Date;
}
export declare const MODEL_PRICING: Record<string, {
    input: number;
    output: number;
}>;
export declare class FallbackManager {
    private db;
    private dbPath;
    private sessionId;
    private budgetConfig;
    private budgetConfigPath;
    private fallbackChain;
    private tiktokenEncoder;
    private modelTimeouts;
    private consecutiveModelFailures;
    private modelUnhealthyUntil;
    constructor(options?: {
        dbPath?: string;
        sessionId?: string;
        budgetConfigPath?: string;
        fallbackChain?: string[];
    });
    private initDatabase;
    loadBudgetConfig(): void;
    private parseSimpleYaml;
    private writeDefaultBudgetFile;
    private initTiktoken;
    /**
     * Đếm số lượng token offline tốc độ cao
     */
    countTokens(text: string): number;
    /**
     * Đếm token cho danh sách ChatMessage
     */
    countMessagesTokens(messages: ChatMessage[]): number;
    calculateCost(model: string, promptTokens: number, completionTokens: number): number;
    logCost(record: Omit<CostRecord, 'id' | 'timestamp'>): void;
    getSessionTotalCost(): number;
    getDayTotalCost(): number;
    private checkBudgetAlerts;
    private triggerOltNotification;
    executeWithFailover(callFn: (model: string) => Promise<ChatResponse>, messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    /**
     * Đóng database connection
     */
    close(): void;
}
//# sourceMappingURL=fallbackManager.d.ts.map