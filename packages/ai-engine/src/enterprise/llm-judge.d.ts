import type { AIProvider } from '../types.js';
export type JudgeTask = 'safety' | 'quality' | 'relevance' | 'factuality' | 'custom';
export interface JudgeConfig {
    /** LLM provider to use for judging */
    provider: AIProvider;
    /** Model to use (defaults to provider's default) */
    model?: string;
    /** Temperature for judge responses (low = more deterministic) */
    temperature?: number;
    /** Max retries on failure */
    maxRetries?: number;
}
export interface JudgeResult {
    passed: boolean;
    score: number;
    verdict: 'pass' | 'fail' | 'warn';
    reasoning: string;
    task: JudgeTask;
    details?: Record<string, unknown>;
}
export interface JudgeRule {
    ruleId: string;
    name: string;
    task: JudgeTask;
    /** Custom judge prompt (overrides built-in) */
    customPrompt?: string;
    /** Score threshold for passing (0-1) */
    passThreshold: number;
    /** Score threshold for warning (0-1, must be < passThreshold) */
    warnThreshold?: number;
    enabled: boolean;
}
export declare const DEFAULT_JUDGE_RULES: JudgeRule[];
export declare class LLMJudge {
    private config;
    private rules;
    constructor(config: JudgeConfig, rules?: JudgeRule[]);
    /** Add a judge rule */
    addRule(rule: JudgeRule): void;
    /** Remove a judge rule */
    removeRule(ruleId: string): boolean;
    /** Evaluate content against a specific task */
    evaluate(content: string, task: JudgeTask, options?: {
        query?: string;
        context?: string;
        customCriteria?: string;
    }): Promise<JudgeResult>;
    /** Evaluate content against all enabled rules */
    evaluateAll(content: string, options?: {
        query?: string;
        context?: string;
        customCriteria?: string;
    }): Promise<JudgeResult[]>;
    /** Evaluate and return aggregate result */
    evaluateAggregate(content: string, options?: {
        query?: string;
        context?: string;
        customCriteria?: string;
        /** Fail if ANY rule fails (default: true) */
        failOnAny?: boolean;
    }): Promise<JudgeResult & {
        allResults: JudgeResult[];
    }>;
    /** Build the judge prompt */
    private buildPrompt;
    /** Parse LLM response */
    private parseResponse;
    /** Get all rules */
    getRules(): JudgeRule[];
    /** Update config */
    updateConfig(updates: Partial<JudgeConfig>): void;
}
//# sourceMappingURL=llm-judge.d.ts.map