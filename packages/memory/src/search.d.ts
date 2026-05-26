export interface SessionMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}
export interface SessionRecord {
    sessionId: string;
    startTime: number;
    endTime: number;
    messages: SessionMessage[];
    summary?: string;
    metadata?: Record<string, unknown>;
}
export interface CrossSessionResult {
    sessionId: string;
    matches: Array<{
        message: SessionMessage;
        score: number;
        context: string;
    }>;
    sessionSummary?: string;
    overallScore: number;
}
export declare class CrossSessionSearch {
    private readonly sessions;
    private readonly index;
    private readonly maxSessions;
    constructor(maxSessions?: number);
    /**
     * Đưa một session vào cơ sở dữ liệu in-memory inverted index
     */
    indexSession(session: SessionRecord): void;
    /**
     * Loại bỏ session khỏi index
     */
    removeSession(sessionId: string): boolean;
    /**
     * Tìm kiếm các message liên quan xuyên suốt tất cả sessions đã lưu
     */
    searchAcrossSessions(query: string, options?: {
        limit?: number;
        minScore?: number;
        sessionType?: string;
    }): CrossSessionResult[];
    /**
     * Đếm tổng số session đã được index
     */
    getSessionCount(): number;
    /**
     * Tóm tắt các kết quả tìm kiếm thành chuỗi text đẹp mắt để chèn trực tiếp vào context
     */
    summarizeResults(results: CrossSessionResult[], maxChars?: number): string;
    /**
     * Xóa toàn bộ dữ liệu index
     */
    clear(): void;
    private tokenize;
    private extractContext;
}
//# sourceMappingURL=search.d.ts.map