// ==============================================================================
// GHITA CODING AGENT - LLM Guardrail Engine
// ==============================================================================
// --- Built-in PII Entities ---
const DEFAULT_PII_ENTITIES = [
    {
        name: 'email',
        patterns: [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g],
        replacement: '[EMAIL_REDACTED]',
        severity: 'medium',
    },
    {
        name: 'phone',
        patterns: [
            /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
            /\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b/g,
            /\b\+?\d{1,3}[-.\s]?\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g,
        ],
        replacement: '[PHONE_REDACTED]',
        severity: 'medium',
    },
    {
        name: 'ssn',
        patterns: [/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g],
        replacement: '[SSN_REDACTED]',
        severity: 'high',
    },
    {
        name: 'credit_card',
        patterns: [/\b(?:\d{4}[-\s]?){3}\d{4}\b/g],
        replacement: '[CARD_REDACTED]',
        severity: 'high',
    },
    {
        name: 'ip_address',
        patterns: [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
        replacement: '[IP_REDACTED]',
        severity: 'low',
    },
    {
        name: 'api_key',
        patterns: [
            /\b(?:sk|pk|api)[_-][A-Za-z0-9]{20,}\b/g,
            /\bghp_[A-Za-z0-9]{36}\b/g,
            /\bglpat-[A-Za-z0-9\-]{20,}\b/g,
        ],
        replacement: '[API_KEY_REDACTED]',
        severity: 'high',
    },
];
// --- Built-in Content Filter Rule ---
function createContentFilterRule(config) {
    return {
        id: 'content_filter',
        name: 'Content Filter',
        description: 'Filters blocked keywords and patterns',
        priority: 100,
        enabled: true,
        check: async (content) => {
            const lowerContent = content.toLowerCase();
            // Check blocked keywords
            for (const keyword of config.blockedKeywords ?? []) {
                if (lowerContent.includes(keyword.toLowerCase())) {
                    return {
                        passed: false,
                        action: 'block',
                        reason: `Content contains blocked keyword: "${keyword}"`,
                        confidence: 0.95,
                        ruleName: 'content_filter',
                    };
                }
            }
            // Check blocked patterns
            for (const pattern of config.blockedPatterns ?? []) {
                if (pattern.test(content)) {
                    return {
                        passed: false,
                        action: 'block',
                        reason: `Content matches blocked pattern: ${pattern.source}`,
                        confidence: 0.9,
                        ruleName: 'content_filter',
                    };
                }
            }
            // Check max length
            if (config.maxLength && content.length > config.maxLength) {
                return {
                    passed: false,
                    action: 'block',
                    reason: `Content exceeds maximum length: ${content.length} > ${config.maxLength}`,
                    confidence: 1.0,
                    ruleName: 'content_filter',
                };
            }
            return null; // No match, continue to next rule
        },
    };
}
// --- PII Detection Rule ---
function createPIIRule(entities) {
    return {
        id: 'pii_detection',
        name: 'PII Detection',
        description: 'Detects and redacts personally identifiable information',
        priority: 50,
        enabled: true,
        check: async (content) => {
            let modified = content;
            let detected = false;
            const foundEntities = [];
            for (const entity of entities) {
                for (const pattern of entity.patterns) {
                    // Reset regex lastIndex for global patterns
                    pattern.lastIndex = 0;
                    if (pattern.test(content)) {
                        detected = true;
                        foundEntities.push(entity.name);
                        pattern.lastIndex = 0;
                        modified = modified.replace(pattern, entity.replacement);
                    }
                }
            }
            if (detected) {
                return {
                    passed: false,
                    action: 'modify',
                    reason: `PII detected: ${foundEntities.join(', ')}`,
                    modifiedContent: modified,
                    confidence: 0.85,
                    ruleName: 'pii_detection',
                };
            }
            return null;
        },
    };
}
// --- LLM Judge Rule ---
function createLLMJudgeRule(config) {
    return {
        id: 'llm_judge',
        name: 'LLM Judge',
        description: 'Uses LLM to evaluate content against criteria',
        priority: 200,
        enabled: true,
        check: async (content, _context) => {
            const criteriaList = config.criteria.map((c) => `- ${c}`).join('\n');
            const prompt = `Evaluate the following content against these criteria:
${criteriaList}

Content:
"""
${content}
"""

Respond with a JSON object: { "passed": boolean, "score": number (0-1), "reason": string }`;
            try {
                const response = await config.llmCall(prompt);
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    const threshold = config.threshold ?? 0.7;
                    if (result.score < threshold) {
                        return {
                            passed: false,
                            action: 'block',
                            reason: `LLM Judge: ${result.reason}`,
                            confidence: result.score,
                            ruleName: 'llm_judge',
                        };
                    }
                }
            }
            catch {
                // If LLM judge fails, don't block
            }
            return null;
        },
    };
}
/**
 * LLMGuardrail — Content safety and compliance engine.
 * Applies rules, PII detection, LLM-as-judge, and content filtering.
 */
export class LLMGuardrail {
    rules = [];
    piiEntities;
    defaultAction;
    auditLog = [];
    auditEnabled;
    constructor(config = {}) {
        this.piiEntities = config.piiEntities ?? DEFAULT_PII_ENTITIES;
        this.defaultAction = config.defaultAction ?? 'allow';
        this.auditEnabled = config.auditLog ?? false;
        // Register built-in rules
        if (config.contentFilter) {
            this.rules.push(createContentFilterRule(config.contentFilter));
        }
        if (this.piiEntities.length > 0) {
            this.rules.push(createPIIRule(this.piiEntities));
        }
        if (config.llmJudge) {
            this.rules.push(createLLMJudgeRule(config.llmJudge));
        }
        // Register custom rules
        for (const rule of config.rules ?? []) {
            this.rules.push(rule);
        }
        // Sort by priority
        this.rules.sort((a, b) => a.priority - b.priority);
    }
    /** Check content against all guardrail rules */
    async check(content, context) {
        for (const rule of this.rules) {
            if (!rule.enabled)
                continue;
            const result = await rule.check(content, context);
            if (result) {
                if (this.auditEnabled) {
                    this.auditLog.push({
                        timestamp: Date.now(),
                        content: content.slice(0, 200),
                        result,
                        context,
                    });
                }
                return result;
            }
        }
        const defaultResult = {
            passed: this.defaultAction === 'allow',
            action: this.defaultAction,
            reason: 'No guardrail rule triggered',
            confidence: 1.0,
        };
        if (this.auditEnabled) {
            this.auditLog.push({
                timestamp: Date.now(),
                content: content.slice(0, 200),
                result: defaultResult,
                context,
            });
        }
        return defaultResult;
    }
    /** Scan content for PII entities and return redacted version */
    scanPII(content) {
        let redacted = content;
        let hasPII = false;
        const entities = [];
        for (const entity of this.piiEntities) {
            for (const pattern of entity.patterns) {
                pattern.lastIndex = 0;
                if (pattern.test(content)) {
                    hasPII = true;
                    entities.push(entity.name);
                    pattern.lastIndex = 0;
                    redacted = redacted.replace(pattern, entity.replacement);
                }
            }
        }
        return { hasPII, redacted, entities };
    }
    /** Add a custom rule at runtime */
    addRule(rule) {
        this.rules.push(rule);
        this.rules.sort((a, b) => a.priority - b.priority);
    }
    /** Remove a rule by ID */
    removeRule(id) {
        const idx = this.rules.findIndex((r) => r.id === id);
        if (idx === -1)
            return false;
        this.rules.splice(idx, 1);
        return true;
    }
    /** Enable/disable a rule */
    setRuleEnabled(id, enabled) {
        const rule = this.rules.find((r) => r.id === id);
        if (!rule)
            return false;
        rule.enabled = enabled;
        return true;
    }
    /** List all rules */
    listRules() {
        return [...this.rules];
    }
    /** Get audit log entries */
    getAuditLog(limit) {
        const entries = [...this.auditLog].reverse();
        return limit ? entries.slice(0, limit) : entries;
    }
    /** Clear audit log */
    clearAuditLog() {
        this.auditLog.length = 0;
    }
}
//# sourceMappingURL=guardrail.js.map