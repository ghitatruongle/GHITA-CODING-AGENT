// 25 test cases covering PII detection, content filtering, LLM judge,
// custom rules, audit log, and rule management.

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMGuardrail } from '../src/guardrail/guardrail.js';
import type { GuardrailRule, GuardrailResult, GuardrailContext } from '../src/guardrail/types.js';

function makeRule(id: string, priority: number, result: GuardrailResult | null): GuardrailRule {
  return {
    id,
    name: `Rule ${id}`,
    description: `Test rule ${id}`,
    priority,
    enabled: true,
    check: async () => result,
  };
}

describe('LLMGuardrail', () => {
  // ── Group 1: PII Detection (6 tests) ──────────────────────────────────

  describe('PII detection', () => {
    it('1. detects email addresses', () => {
      const guard = new LLMGuardrail();
      const result = guard.scanPII('Contact me at john.doe@example.com');
      expect(result.hasPII).toBe(true);
      expect(result.entities).toContain('email');
      expect(result.redacted).toContain('[EMAIL_REDACTED]');
    });

    it('2. detects phone numbers', () => {
      const guard = new LLMGuardrail();
      const result = guard.scanPII('Call me at 555-123-4567');
      expect(result.hasPII).toBe(true);
      expect(result.entities).toContain('phone');
      expect(result.redacted).toContain('[PHONE_REDACTED]');
    });

    it('3. detects SSN', () => {
      const guard = new LLMGuardrail();
      const result = guard.scanPII('My SSN is 123-45-6789');
      expect(result.hasPII).toBe(true);
      expect(result.entities).toContain('ssn');
      expect(result.redacted).toContain('[SSN_REDACTED]');
    });

    it('4. detects credit card numbers', () => {
      const guard = new LLMGuardrail({
        piiEntities: [
          {
            name: 'credit_card',
            patterns: [/(?:\d{4}[-\s]?){3}\d{4}/g],
            replacement: '[CARD_REDACTED]',
            severity: 'high',
          },
        ],
      });
      const result = guard.scanPII('Card: 4111-1111-1111-1111');
      expect(result.hasPII).toBe(true);
      expect(result.entities).toContain('credit_card');
      expect(result.redacted).toContain('[CARD_REDACTED]');
    });

    it('5. detects API keys', () => {
      const guard = new LLMGuardrail();
      const result = guard.scanPII('Use sk-ABCDEFGHIJKLMNOPQRST1234');
      expect(result.hasPII).toBe(true);
      expect(result.entities).toContain('api_key');
    });

    it('6. clean content returns no PII', () => {
      const guard = new LLMGuardrail();
      const result = guard.scanPII('Hello world, this is a normal message');
      expect(result.hasPII).toBe(false);
      expect(result.entities).toHaveLength(0);
    });
  });

  // ── Group 2: Content filtering (5 tests) ──────────────────────────────

  describe('content filtering', () => {
    it('7. blocks content with blocked keywords', async () => {
      const guard = new LLMGuardrail({
        contentFilter: { blockedKeywords: ['spam', 'scam'] },
      });
      const result = await guard.check('This is a spam message');
      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('spam');
    });

    it('8. blocks content matching blocked patterns', async () => {
      const guard = new LLMGuardrail({
        contentFilter: { blockedPatterns: [/malware\d+/i] },
      });
      const result = await guard.check('Download malware2024 now');
      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
    });

    it('9. blocks content exceeding max length', async () => {
      const guard = new LLMGuardrail({
        contentFilter: { maxLength: 10 },
      });
      const result = await guard.check('This content is way too long');
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('maximum length');
    });

    it('10. allows clean content through filter', async () => {
      const guard = new LLMGuardrail({
        contentFilter: { blockedKeywords: ['spam'] },
      });
      const result = await guard.check('This is a perfectly normal message');
      expect(result.passed).toBe(true);
      expect(result.action).toBe('allow');
    });

    it('11. content filter is case-insensitive', async () => {
      const guard = new LLMGuardrail({
        contentFilter: { blockedKeywords: ['SPAM'] },
      });
      const result = await guard.check('this contains spam here');
      expect(result.passed).toBe(false);
    });
  });

  // ── Group 3: PII check via guardrail engine (4 tests) ──────────────────

  describe('PII check via engine', () => {
    it('12. PII rule triggers modify action', async () => {
      const guard = new LLMGuardrail();
      const result = await guard.check('My email is test@test.com please contact me');
      expect(result.passed).toBe(false);
      expect(result.action).toBe('modify');
      expect(result.modifiedContent).toContain('[EMAIL_REDACTED]');
    });

    it('13. no PII passes through', async () => {
      const guard = new LLMGuardrail();
      const result = await guard.check('Hello, how are you today?');
      expect(result.passed).toBe(true);
    });

    it('14. PII detects multiple entity types', async () => {
      const guard = new LLMGuardrail();
      const result = await guard.check('Email: user@test.com, Phone: 555-123-4567');
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('email');
    });

    it('15. custom PII entities work', async () => {
      const guard = new LLMGuardrail({
        piiEntities: [
          {
            name: 'employee_id',
            patterns: [/\bEMP-\d{5}\b/g],
            replacement: '[EMP_ID]',
            severity: 'medium',
          },
        ],
      });
      const result = guard.scanPII('Employee EMP-12345 reported issue');
      expect(result.hasPII).toBe(true);
      expect(result.entities).toContain('employee_id');
      expect(result.redacted).toContain('[EMP_ID]');
    });
  });

  // ── Group 4: LLM Judge (3 tests) ──────────────────────────────────────

  describe('LLM judge', () => {
    it('16. LLM judge blocks low-scoring content', async () => {
      const guard = new LLMGuardrail({
        llmJudge: {
          criteria: ['Must be professional', 'No offensive language'],
          threshold: 0.7,
          llmCall: async () =>
            JSON.stringify({
              passed: false,
              score: 0.3,
              reason: 'Contains unprofessional language',
            }),
        },
      });
      const result = await guard.check('This is terrible and stupid');
      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('LLM Judge');
    });

    it('17. LLM judge allows high-scoring content', async () => {
      const guard = new LLMGuardrail({
        llmJudge: {
          criteria: ['Must be helpful'],
          threshold: 0.5,
          llmCall: async () => JSON.stringify({ passed: true, score: 0.9, reason: 'Very helpful' }),
        },
      });
      const result = await guard.check('Here is a detailed solution to your problem');
      expect(result.passed).toBe(true);
    });

    it('18. LLM judge failure does not block on error', async () => {
      const guard = new LLMGuardrail({
        llmJudge: {
          criteria: ['Test'],
          threshold: 0.5,
          llmCall: async () => {
            throw new Error('LLM unavailable');
          },
        },
      });
      const result = await guard.check('Some content');
      expect(result.passed).toBe(true); // Error = don't block
    });
  });

  // ── Group 5: Rule management (4 tests) ─────────────────────────────────

  describe('rule management', () => {
    it('19. addRule adds custom rule', async () => {
      const guard = new LLMGuardrail();
      guard.addRule(
        makeRule('custom1', 10, {
          passed: false,
          action: 'block',
          reason: 'Custom block',
          confidence: 1,
        }),
      );
      const result = await guard.check('anything');
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('Custom block');
    });

    it('20. removeRule removes by id', () => {
      const guard = new LLMGuardrail();
      guard.addRule(makeRule('removable', 10, null));
      expect(guard.removeRule('removable')).toBe(true);
      expect(guard.removeRule('nonexistent')).toBe(false);
    });

    it('21. setRuleEnabled toggles rule', async () => {
      const guard = new LLMGuardrail();
      guard.addRule(
        makeRule('toggle', 5, { passed: false, action: 'block', reason: 'blocked', confidence: 1 }),
      );
      guard.setRuleEnabled('toggle', false);
      const result = await guard.check('test');
      expect(result.passed).toBe(true); // Disabled rule doesn't trigger
    });

    it('22. rules are sorted by priority', async () => {
      const guard = new LLMGuardrail();
      guard.addRule(makeRule('low', 100, null));
      guard.addRule(
        makeRule('high', 1, {
          passed: false,
          action: 'block',
          reason: 'high priority',
          confidence: 1,
        }),
      );
      const rules = guard.listRules();
      expect(rules[0]!.id).toBe('high');
    });
  });

  // ── Group 6: Audit log (3 tests) ──────────────────────────────────────

  describe('audit log', () => {
    it('23. audit log records checks when enabled', async () => {
      const guard = new LLMGuardrail({ auditLog: true });
      await guard.check('test content');
      const log = guard.getAuditLog();
      expect(log.length).toBeGreaterThanOrEqual(1);
      expect(log[0]!.content).toBe('test content');
    });

    it('24. audit log is empty when disabled', async () => {
      const guard = new LLMGuardrail({ auditLog: false });
      await guard.check('test');
      expect(guard.getAuditLog()).toHaveLength(0);
    });

    it('25. clearAuditLog empties the log', async () => {
      const guard = new LLMGuardrail({ auditLog: true });
      await guard.check('test1');
      await guard.check('test2');
      guard.clearAuditLog();
      expect(guard.getAuditLog()).toHaveLength(0);
    });
  });
});
