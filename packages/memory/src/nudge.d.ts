import type { MemoryEntry } from '@ghita/shared';
export interface NudgeSuggestion {
    id: string;
    type: 'preference' | 'fact' | 'solution' | 'knowledge';
    content: string;
    confidence: number;
    sourceMessage: string;
    reason: string;
}
export interface NudgePattern {
    name: string;
    type: NudgeSuggestion['type'];
    regex: RegExp;
    confidenceBoost: number;
    extractor: (match: RegExpMatchArray, fullMessage: string) => string;
}
export interface NudgeConfig {
    minConfidence: number;
    autoSaveThreshold: number;
    patterns?: NudgePattern[];
}
export declare class MemoryNudgeEngine {
    private readonly config;
    private readonly customPatterns;
    constructor(config?: Partial<NudgeConfig>);
    /**
     * Quét chuỗi hội thoại để phát hiện thông tin quan trọng cần ghi nhớ
     */
    analyzeForNudges(messages: Array<{
        role: string;
        content: string;
    }>): NudgeSuggestion[];
    /**
     * Trả về true nếu gợi ý này đủ điều kiện tự động lưu vào bộ nhớ mà không cần hỏi người dùng
     */
    shouldAutoSave(nudge: NudgeSuggestion): boolean;
    /**
     * Thêm mẫu nhận diện tùy chỉnh
     */
    addCustomPattern(pattern: NudgePattern): void;
    /**
     * Chuyển đổi NudgeSuggestion thành MemoryEntry để lưu trữ
     */
    toMemoryEntry(nudge: NudgeSuggestion): MemoryEntry;
}
//# sourceMappingURL=nudge.d.ts.map