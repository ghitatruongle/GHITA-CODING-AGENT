import type { ChatMessage } from '../types.js';
/** Mức độ quan trọng của một message trong trajectory */
export type MessageImportance = 'critical' | 'high' | 'medium' | 'low' | 'noise';
/** Kết quả phân tích một message */
export interface MessageAnalysis {
    message: ChatMessage;
    importance: MessageImportance;
    reason: string;
    /** true nếu message chứa quyết định hoặc outcome quan trọng */
    isDecision: boolean;
    /** true nếu message chứa lỗi hoặc exception */
    isError: boolean;
    /** Token count ước tính */
    estimatedTokens: number;
}
/** Kết quả compression */
export interface CompressionResult {
    /** Messages đã nén */
    messages: ChatMessage[];
    /** Số messages gốc */
    originalCount: number;
    /** Số messages sau nén */
    compressedCount: number;
    /** Token count ước tính trước nén */
    originalTokens: number;
    /** Token count ước tính sau nén */
    compressedTokens: number;
    /** Tỷ lệ nén (0-1, thấp hơn = nén nhiều hơn) */
    compressionRatio: number;
}
/** Cấu hình compressor */
export interface CompressorConfig {
    /** Ngưỡng token tối đa (default 128000) */
    maxTokens: number;
    /** Tỷ lệ % token mục tiêu sau nén (default 0.5 = 50% of max) */
    targetRatio: number;
    /** Số messages cuối luôn giữ nguyên, không nén (default 10) */
    preserveRecentCount: number;
    /** Luôn giữ system messages (default true) */
    preserveSystemMessages: boolean;
    /** Patterns regex để phát hiện decisions (default: list chuẩn) */
    decisionPatterns: RegExp[];
    /** Patterns regex để phát hiện errors (default: list chuẩn) */
    errorPatterns: RegExp[];
}
export declare class TrajectoryCompressor {
    private readonly config;
    constructor(config?: Partial<CompressorConfig>);
    /**
     * Nén trajectory bằng rule-based heuristics (không cần LLM).
     * Multi-pass compression:
     *   Pass 1: Phân tích importance mỗi message
     *   Pass 2: Nhóm và tóm tắt messages ít quan trọng
     *   Pass 3: Ghép lại thành trajectory nén
     */
    compress(messages: ChatMessage[]): CompressionResult;
    /**
     * Nén trajectory bằng LLM (async — gọi LLM để tóm tắt).
     * Cần truyền một hàm summarizer.
     */
    compressAsync(messages: ChatMessage[], summarizer: (messagesToSummarize: ChatMessage[]) => Promise<string>): Promise<CompressionResult>;
    /**
     * Phân tích importance của mỗi message.
     */
    analyzeMessages(messages: ChatMessage[]): MessageAnalysis[];
    /**
     * Lấy cấu hình hiện tại.
     */
    getConfig(): CompressorConfig;
    /**
     * Cập nhật cấu hình.
     */
    updateConfig(config: Partial<CompressorConfig>): void;
    /**
     * Áp dụng compression dựa trên analyses.
     * Giữ critical/high, nhóm và tóm tắt medium/low/noise.
     */
    private applyCompression;
    /**
     * Tóm tắt một nhóm messages ít quan trọng thành 1 message.
     */
    private summarizeGroup;
    /**
     * Trích xuất summary ngắn gọn từ content dài.
     */
    private extractSummary;
    /**
     * Truncate một message để fit trong token budget.
     */
    private truncateMessage;
    /**
     * Kiểm tra content có match bất kỳ pattern nào không.
     */
    private matchesPatterns;
    /**
     * Ước tính token count cho 1 message.
     */
    private estimateTokensSingle;
    /**
     * Ước tính tổng token count.
     */
    private estimateTokensTotal;
}
//# sourceMappingURL=compressor.d.ts.map