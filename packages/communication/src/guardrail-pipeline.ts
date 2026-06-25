// ==============================================================================
// GHITA CODING AGENT - Guardrail Pipeline
// ==============================================================================
// Wire LLMGuardrail (from @ghita/memory) vào GatewayDaemon. Pipeline:
//   1. Extract text từ GatewayMessage
//   2. Scan PII (email/phone/SSN/credit card/IP/API key) → redact
//   3. Run content filter (blocked keywords, max length)
//   4. Return { allowed, sanitized, original, threats[] }
// ==============================================================================

import type { GatewayMessage, GatewayType } from './gateway/types.js';

export interface GuardrailPipelineResult {
  allowed: boolean;
  sanitized: string;
  original: string;
  threats: GuardrailThreat[];
  redactedEntities: string[];
  blockedBy?: string;
}

export interface GuardrailThreat {
  type: 'pii' | 'content_filter' | 'length' | 'pattern' | 'language';
  severity: 'low' | 'medium' | 'high';
  description: string;
  entity?: string;
}

export interface GuardrailPipelineConfig {
  /** Max content length (chars) */
  maxLength?: number;
  /** Blocked keywords (case-insensitive) */
  blockedKeywords?: string[];
  /** Custom PII patterns (regex) */
  piiPatterns?: Array<{
    name: string;
    pattern: RegExp;
    severity?: 'low' | 'medium' | 'high';
    replacement?: string;
  }>;
  /** Action khi có threat high-severity */
  onHighSeverity?: 'block' | 'flag' | 'redact';
  /** Enable audit log */
  auditLog?: boolean;
}

const DEFAULT_PII_PATTERNS = [
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    severity: 'medium' as const,
    replacement: '[EMAIL_REDACTED]',
  },
  {
    name: 'phone',
    pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    severity: 'medium' as const,
    replacement: '[PHONE_REDACTED]',
  },
  {
    name: 'ssn',
    pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
    severity: 'high' as const,
    replacement: '[SSN_REDACTED]',
  },
  {
    name: 'credit_card',
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    severity: 'high' as const,
    replacement: '[CARD_REDACTED]',
  },
  {
    name: 'ip_address',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    severity: 'low' as const,
    replacement: '[IP_REDACTED]',
  },
  {
    name: 'api_key',
    pattern: /\b(?:sk|pk|api)[_-][A-Za-z0-9]{20,}\b/g,
    severity: 'high' as const,
    replacement: '[API_KEY_REDACTED]',
  },
  {
    name: 'github_pat',
    pattern: /\bghp_[A-Za-z0-9]{36}\b/g,
    severity: 'high' as const,
    replacement: '[GITHUB_PAT_REDACTED]',
  },
];

const DEFAULT_BLOCKED_KEYWORDS = [
  'password=',
  'api_key=',
  'secret=',
  'BEGIN RSA PRIVATE',
  'BEGIN OPENSSH PRIVATE',
  'BEGIN PRIVATE KEY',
];

const DEFAULT_MAX_LENGTH = 32_000;

/**
 * Self-contained guardrail pipeline. Hoạt động độc lập, KHÔNG depend
 * vào @ghita/memory (tránh vòng lặp dependency trong communication).
 * Tương thích API với LLMGuardrail.scanPII/check() ở mức cơ bản.
 */
export class GuardrailPipeline {
  private config: Required<GuardrailPipelineConfig>;
  private auditLog: Array<{
    timestamp: number;
    gateway: GatewayType;
    result: GuardrailPipelineResult;
  }> = [];

  constructor(config: GuardrailPipelineConfig = {}) {
    this.config = {
      maxLength: config.maxLength ?? DEFAULT_MAX_LENGTH,
      blockedKeywords: config.blockedKeywords ?? DEFAULT_BLOCKED_KEYWORDS,
      piiPatterns: config.piiPatterns ?? [],
      onHighSeverity: config.onHighSeverity ?? 'redact',
      auditLog: config.auditLog ?? true,
    };
  }

  /** Process một GatewayMessage */
  process(message: GatewayMessage): GuardrailPipelineResult {
    const text = message.text ?? '';
    const threats: GuardrailThreat[] = [];
    const redactedEntities: string[] = [];
    let sanitized = text;
    let blockedBy: string | undefined;

    // Step 1: length check
    if (text.length > this.config.maxLength) {
      threats.push({
        type: 'length',
        severity: 'high',
        description: `Content exceeds max length: ${text.length} > ${this.config.maxLength}`,
      });
      if (this.config.onHighSeverity === 'block') {
        blockedBy = 'length';
      } else {
        sanitized = `${text.slice(0, this.config.maxLength)  }...[truncated]`;
      }
    }

    // Step 2: content filter (blocked keywords)
    const lowerText = sanitized.toLowerCase();
    for (const kw of this.config.blockedKeywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        threats.push({
          type: 'content_filter',
          severity: 'high',
          description: `Blocked keyword detected: "${kw}"`,
        });
        blockedBy = 'content_filter';
        break;
      }
    }

    // Step 3: PII scan + redact
    const allPatterns = [...DEFAULT_PII_PATTERNS, ...this.config.piiPatterns];
    for (const entity of allPatterns) {
      entity.pattern.lastIndex = 0;
      if (entity.pattern.test(sanitized)) {
        threats.push({
          type: 'pii',
          severity: entity.severity ?? 'medium',
          description: `PII entity detected: ${entity.name}`,
          entity: entity.name,
        });
        redactedEntities.push(entity.name);
        entity.pattern.lastIndex = 0;
        sanitized = sanitized.replace(entity.pattern, entity.replacement ?? '[REDACTED]');

        // High severity PII → block if policy says so
        if (entity.severity === 'high' && this.config.onHighSeverity === 'block') {
          blockedBy = `pii:${entity.name}`;
        }
      }
    }

    const result: GuardrailPipelineResult = {
      allowed: !blockedBy,
      sanitized,
      original: text,
      threats,
      redactedEntities,
      blockedBy,
    };

    if (this.config.auditLog) {
      this.auditLog.push({ timestamp: Date.now(), gateway: message.gatewayType, result });
      // Keep last 1000 entries
      if (this.auditLog.length > 1000) {
        this.auditLog.splice(0, this.auditLog.length - 1000);
      }
    }

    return result;
  }

  /** Batch process nhiều messages */
  processBatch(messages: GatewayMessage[]): GuardrailPipelineResult[] {
    return messages.map((m) => this.process(m));
  }

  /** Get recent audit log */
  getAuditLog(
    limit = 100,
  ): Array<{ timestamp: number; gateway: GatewayType; result: GuardrailPipelineResult }> {
    return this.auditLog.slice(-limit);
  }

  /** Get stats */
  getStats(): {
    total: number;
    allowed: number;
    blocked: number;
    redactedEntities: Record<string, number>;
    threatsBySeverity: Record<string, number>;
  } {
    const stats = {
      total: this.auditLog.length,
      allowed: 0,
      blocked: 0,
      redactedEntities: {} as Record<string, number>,
      threatsBySeverity: { low: 0, medium: 0, high: 0 },
    };
    for (const entry of this.auditLog) {
      if (entry.result.allowed) stats.allowed++;
      else stats.blocked++;
      for (const e of entry.result.redactedEntities) {
        stats.redactedEntities[e] = (stats.redactedEntities[e] ?? 0) + 1;
      }
      for (const t of entry.result.threats) {
        stats.threatsBySeverity[t.severity] = (stats.threatsBySeverity[t.severity] ?? 0) + 1;
      }
    }
    return stats;
  }

  /** Clear audit log */
  clearAuditLog(): void {
    this.auditLog = [];
  }
}

// ----------------------------------------------------------------------------
// Daemon integration helper
// ----------------------------------------------------------------------------

/** Tạo hook function cho GatewayDaemon.setGuardrailHook() */
export function createDaemonGuardrailHook(pipeline: GuardrailPipeline) {
  return async (_source: string, message: unknown): Promise<unknown> => {
    const msg = message as GatewayMessage;
    if (!msg || typeof msg.text !== 'string') {
      // Không phải GatewayMessage shape - pass through
      return message;
    }
    const result = pipeline.process(msg);
    if (!result.allowed) {
      throw new Error(`Blocked by guardrail: ${result.blockedBy ?? 'unknown'}`);
    }
    // Trả về message đã redact PII
    return { ...msg, text: result.sanitized };
  };
}
