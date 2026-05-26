export type FilterAction = 'block' | 'flag' | 'warn' | 'log' | 'mask';
export type ContentDirection = 'input' | 'output' | 'both';
export type ContentCategory = 'hate' | 'violence' | 'sexual' | 'self_harm' | 'harassment' | 'spam' | 'malicious_code' | 'custom';
export interface ContentFilterRule {
    ruleId: string;
    name: string;
    description?: string;
    enabled: boolean;
    direction: ContentDirection;
    categories: ContentCategory[];
    action: FilterAction;
    /** Custom regex patterns */
    patterns?: RegExp[];
    /** Keywords to match (case-insensitive) */
    keywords?: string[];
    /** Minimum confidence threshold (0-1) */
    confidenceThreshold?: number;
    priority: number;
}
export interface ContentFilterResult {
    passed: boolean;
    action: FilterAction;
    matchedRules: Array<{
        ruleId: string;
        ruleName: string;
        category: ContentCategory;
        action: FilterAction;
        confidence: number;
        matchedText?: string;
    }>;
    filteredContent?: string;
    summary: string;
}
export interface ModerationResult {
    flagged: boolean;
    categories: Record<ContentCategory, boolean>;
    scores: Record<ContentCategory, number>;
}
export declare class ContentFilter {
    private rules;
    private bannedKeywords;
    constructor(options?: {
        rules?: ContentFilterRule[];
        bannedKeywords?: string[];
    });
    /** Add a filter rule */
    addRule(rule: ContentFilterRule): void;
    /** Remove a rule */
    removeRule(ruleId: string): boolean;
    /** Add banned keywords */
    addBannedKeywords(keywords: string[]): void;
    /** Remove banned keywords */
    removeBannedKeywords(keywords: string[]): void;
    /** Filter content */
    filter(content: string, direction: ContentDirection): ContentFilterResult;
    /** Quick check if content is safe */
    isSafe(content: string, direction?: ContentDirection): boolean;
    /** Apply masking to sensitive content */
    private applyMasking;
    /** Get all rules */
    getRules(): ContentFilterRule[];
    /** Get banned keywords */
    getBannedKeywords(): string[];
    /** Export rules as JSON for persistence */
    exportRules(): string;
}
//# sourceMappingURL=content-filter.d.ts.map