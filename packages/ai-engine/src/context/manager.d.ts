import type { ChatMessage } from '../types.js';
export interface ContextConfig {
    maxTokens: number;
    compactThreshold: number;
    strategy: 'sliding_window' | 'summary' | 'trajectory';
}
export declare class ContextManager {
    private config;
    private compressor;
    constructor(config?: Partial<ContextConfig>);
    /** Ước tính token count (rough: 1 token ≈ 4 chars tiếng Anh, 2 chars tiếng Việt) */
    estimateTokens(messages: ChatMessage[]): number;
    /** Kiểm tra có cần compact không */
    needsCompact(messages: ChatMessage[]): boolean;
    /** Compact messages — sliding window strategy */
    compact(messages: ChatMessage[]): ChatMessage[];
    /** Giữ lại messages gần nhất trong budget token */
    private compactSlidingWindow;
    /** Compact bằng cách tóm tắt (placeholder — cần AI call) */
    private compactWithSummary;
    /** Lấy usage info */
    getUsage(messages: ChatMessage[]): {
        used: number;
        max: number;
        percentage: number;
    };
    /** Cập nhật config */
    updateConfig(config: Partial<ContextConfig>): void;
    /** Lấy config hiện tại */
    getConfig(): ContextConfig;
}
//# sourceMappingURL=manager.d.ts.map