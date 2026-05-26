import type { ChatMiddleware, ChatStreamMiddleware } from '../utils/middleware.js';
export interface AntiSlopConfig {
    /** Custom slop patterns to filter (regex strings) */
    customPatterns?: string[];
    /** Path to slop config YAML file (default: '.ghita/slop.yaml') */
    slopConfigPath?: string;
    /** Enable token savings tracking (default: true) */
    trackSavings?: boolean;
    /** Minimum match length to filter (default: 5) */
    minMatchLength?: number;
}
interface TokenSavingsLog {
    timestamp: string;
    tokensSaved: number;
    patternsMatched: string[];
    totalInputTokens: number;
}
declare class AhoCorasick {
    private patterns;
    private gotoFn;
    private outputFn;
    private failFn;
    private built;
    constructor(patterns: string[]);
    build(): void;
    /** Find all pattern matches in text. Returns {patternIndex, position}[] */
    search(text: string): Array<{
        patternIndex: number;
        endPos: number;
    }>;
}
declare class TokenSavingsTracker {
    private logs;
    private totalSaved;
    private dbPath;
    private db;
    private insertStmt;
    private dbInitialized;
    constructor(dbPath?: string);
    /** Initialize SQLite database and create table (lazy, async) */
    private ensureDb;
    /** Export a single savings entry to SQLite */
    private exportToSqlite;
    record(tokensSaved: number, patternsMatched: string[], totalInputTokens: number): void;
    getTotalSaved(): number;
    getLogs(): TokenSavingsLog[];
    getSummary(): {
        totalSaved: number;
        passCount: number;
        avgSavedPerPass: number;
    };
    /** Close SQLite connection */
    close(): void;
}
export declare class AntiSlopFilter {
    private patterns;
    private acMatcher;
    private codeBlockState;
    private savingsTracker;
    private config;
    constructor(config?: AntiSlopConfig);
    /** Get the underlying Aho-Corasick matcher instance */
    getAcMatcher(): AhoCorasick;
    /** Get the savings tracker instance */
    getSavingsTracker(): TokenSavingsTracker;
    /** Try to strip one leading slop phrase from text. Returns whether a match was found. */
    private tryStripOne;
    /** Clean a single text chunk — strip leading slop phrases (multi-pass for chained slop) */
    cleanChunk(text: string): {
        cleaned: string;
        charsRemoved: number;
        matchedPatterns: string[];
    };
    /** Clean accumulated text with code block awareness */
    cleanWithCodeBlockAwareness(text: string): {
        cleaned: string;
        charsRemoved: number;
        matchedPatterns: string[];
    };
    /** Get token savings summary */
    getSavingsSummary(): {
        totalSaved: number;
        passCount: number;
        avgSavedPerPass: number;
    };
    /** Get detailed savings logs */
    getSavingsLogs(): TokenSavingsLog[];
    /** Reset code block state (call before processing a new stream) */
    resetCodeBlockState(): void;
}
export declare function createAntiSlopStreamMiddleware(config?: AntiSlopConfig): ChatStreamMiddleware;
export declare function createAntiSlopMiddleware(config?: AntiSlopConfig): ChatMiddleware;
export declare function cleanSlop(text: string, config?: AntiSlopConfig): string;
export {};
//# sourceMappingURL=antiSlop.d.ts.map