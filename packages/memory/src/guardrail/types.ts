export type GuardrailAction = 'allow' | 'block' | 'flag' | 'modify';

export interface GuardrailResult {
  /** Whether the content passed the guardrail */
  passed: boolean;
  /** Action to take */
  action: GuardrailAction;
  /** Reason for the decision */
  reason: string;
  /** Modified content (if action is 'modify') */
  modifiedContent?: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Which rule triggered */
  ruleName?: string;
}

export interface GuardrailRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Rule description */
  description: string;
  /** Rule priority (lower = higher priority) */
  priority: number;
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Check function */
  check: (content: string, context?: GuardrailContext) => Promise<GuardrailResult | null>;
}

export interface GuardrailContext {
  /** The agent making the request */
  agentId?: string;
  /** The model being used */
  model?: string;
  /** The provider */
  provider?: string;
  /** Message history for context */
  history?: Array<{ role: string; content: string }>;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

export interface PIIEntityType {
  /** Entity type name */
  name: string;
  /** Regex patterns to detect */
  patterns: RegExp[];
  /** Replacement text */
  replacement: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high';
}

export interface LLMJudgeConfig {
  /** Model to use as judge */
  model?: string;
  /** Provider for the judge model */
  provider?: string;
  /** Evaluation criteria */
  criteria: string[];
  /** Pass threshold (0-1) */
  threshold?: number;
  /** LLM call function */
  llmCall: (prompt: string) => Promise<string>;
}

export interface ContentFilterConfig {
  /** Blocked keywords */
  blockedKeywords?: string[];
  /** Blocked patterns (regex) */
  blockedPatterns?: RegExp[];
  /** Maximum content length */
  maxLength?: number;
  /** Allowed languages (empty = all) */
  allowedLanguages?: string[];
}

export interface GuardrailConfig {
  /** Rules to apply */
  rules?: GuardrailRule[];
  /** PII detection entities */
  piiEntities?: PIIEntityType[];
  /** LLM judge configuration */
  llmJudge?: LLMJudgeConfig;
  /** Content filter configuration */
  contentFilter?: ContentFilterConfig;
  /** Global action when no rule matches */
  defaultAction?: GuardrailAction;
  /** Enable audit logging */
  auditLog?: boolean;
}
