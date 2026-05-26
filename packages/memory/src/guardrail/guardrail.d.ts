import type { GuardrailRule, GuardrailResult, GuardrailContext, GuardrailConfig } from './types.js';
export interface AuditLogEntry {
    timestamp: number;
    content: string;
    result: GuardrailResult;
    context?: GuardrailContext;
}
/**
 * LLMGuardrail — Content safety and compliance engine.
 * Applies rules, PII detection, LLM-as-judge, and content filtering.
 */
export declare class LLMGuardrail {
    private readonly rules;
    private readonly piiEntities;
    private readonly defaultAction;
    private readonly auditLog;
    private readonly auditEnabled;
    constructor(config?: GuardrailConfig);
    /** Check content against all guardrail rules */
    check(content: string, context?: GuardrailContext): Promise<GuardrailResult>;
    /** Scan content for PII entities and return redacted version */
    scanPII(content: string): {
        hasPII: boolean;
        redacted: string;
        entities: string[];
    };
    /** Add a custom rule at runtime */
    addRule(rule: GuardrailRule): void;
    /** Remove a rule by ID */
    removeRule(id: string): boolean;
    /** Enable/disable a rule */
    setRuleEnabled(id: string, enabled: boolean): boolean;
    /** List all rules */
    listRules(): GuardrailRule[];
    /** Get audit log entries */
    getAuditLog(limit?: number): AuditLogEntry[];
    /** Clear audit log */
    clearAuditLog(): void;
}
//# sourceMappingURL=guardrail.d.ts.map