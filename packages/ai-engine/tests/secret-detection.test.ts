// 30 test cases covering detection of API keys, tokens, passwords,
// connection strings, redaction, allowlist, and custom patterns.

import { describe, it, expect, beforeEach } from 'vitest';
import { SecretDetector } from '../src/enterprise/secret-detection.js';
import type { SecretPattern } from '../src/enterprise/secret-detection.js';

describe('SecretDetector', () => {
  let detector: SecretDetector;

  beforeEach(() => {
    detector = new SecretDetector();
  });

  // ── Group 1: OpenAI keys (4 tests) ─────────────────────────────────────

  describe('OpenAI key detection', () => {
    it('1. detects sk- prefixed API key', () => {
      const result = detector.detect('My api key is sk-abc123def456ghi789jkl012');
      expect(result.detected).toBe(true);
      expect(result.findings.some((f) => f.provider === 'openai')).toBe(true);
    });

    it('2. detects sk-proj- project key', () => {
      const result = detector.detect('sk-proj-abcdefghijklmnopqrstuvwxyz0123456789');
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.description).toContain('OpenAI');
    });

    it('3. detects sk-org- org key', () => {
      const result = detector.detect('sk-org-abcdefghijklmnopqrstuvwxyz0123456789');
      expect(result.detected).toBe(true);
    });

    it('4. does not flag random strings', () => {
      const result = detector.detect('This is just a normal text without keys');
      expect(result.detected).toBe(false);
      expect(result.findings).toHaveLength(0);
    });
  });

  // ── Group 2: Anthropic keys (2 tests) ──────────────────────────────────

  describe('Anthropic key detection', () => {
    it('5. detects sk-ant- key', () => {
      const result = detector.detect('sk-ant-api03-abcdef1234567890abcdef12');
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.provider).toBe('anthropic');
    });

    it('6. confidence is high for Anthropic keys', () => {
      const result = detector.detect('sk-ant-api03-abcdef1234567890abcdef12');
      expect(result.findings[0]!.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  // ── Group 3: GitHub tokens (3 tests) ───────────────────────────────────

  describe('GitHub token detection', () => {
    it('7. detects personal token (ghp_)', () => {
      const result = detector.detect('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZab01234567');
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.provider).toBe('github');
      expect(result.findings[0]!.type).toBe('access_token');
    });

    it('8. detects OAuth token (gho_)', () => {
      const result = detector.detect('gho_ABCDEFGHIJKLMNOPQRSTUVWXYZab01234567');
      expect(result.detected).toBe(true);
    });

    it('9. detects GitHub App token (ghu_)', () => {
      const result = detector.detect('ghu_ABCDEFGHIJKLMNOPQRSTUVWXYZab01234567');
      expect(result.detected).toBe(true);
    });
  });

  // ── Group 4: AWS credentials (2 tests) ─────────────────────────────────

  describe('AWS credentials', () => {
    it('10. detects AWS Access Key ID (AKIA)', () => {
      const result = detector.detect('aws_ACCESS_KEY_ID: AKIAIOSFODNN7EXAMPLE');
      expect(result.detected).toBe(true);
      expect(result.findings.some((f) => f.provider === 'aws')).toBe(true);
    });

    it('11. detects aws config credentials', () => {
      const result = detector.detect('aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
      expect(result.detected).toBe(true);
    });
  });

  // ── Group 5: Google API key (2 tests) ──────────────────────────────────

  describe('Google API key', () => {
    it('12. detects AIza-prefixed key', () => {
      const result = detector.detect('key: AIzaSyB1C2D3E4F5G6H7I8J9K0L1M2N3O4P5Q6R');
      expect(result.detected).toBe(true);
      const googleFindings = result.findings.filter((f: any) => f.provider === 'google');
      expect(googleFindings.length).toBeGreaterThanOrEqual(1);
    });

    it('13. does not flag non-G keys', () => {
      const result = detector.detect('Random data: not aa');
      expect(result.findings.filter((f) => f.provider === 'google')).toHaveLength(0);
    });
  });

  // ── Group 6: Connection strings (4 tests) ──────────────────────────────

  describe('connection string detection', () => {
    it('14. detects MongoDB connection string', () => {
      const result = detector.detect('mongodb+srv://admin:password123@cluster0.mongodb.net/mydb');
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.provider).toBe('mongodb');
      expect(result.findings[0]!.type).toBe('connection_string');
    });

    it('15. detects PostgreSQL connection string', () => {
      const result = detector.detect('postgresql://user:pass12345@localhost:5432/mydb');
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.provider).toBe('postgres');
    });

    it('16. detects Redis connection string', () => {
      const result = detector.detect('rediss://default:mysecretpassword@redis.example.com:6379');
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.provider).toBe('redis');
    });

    it('17. detects MySQL connection string', () => {
      const result = detector.detect('mysql://root:secretpassword@db.example.com:3306/mydb');
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.provider).toBe('mysql');
    });
  });

  // ── Group 7: JWT detection (2 tests) ───────────────────────────────────

  describe('JWT detection', () => {
    it('18. detects JWT token', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.Gfx0Rbsa0123';
      const result = detector.detect(`Authorization: Bearer ${jwt}`);
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.type).toBe('jwt');
    });

    it('19. does not flag base64 that looks like JWT', () => {
      const result = detector.detect('eyJ is just a variable name');
      expect(result.detected).toBe(false);
    });
  });

  // ── Group 8: Password detection (2 tests) ──────────────────────────────

  describe('password detection', () => {
    it('20. detects password in config', () => {
      const result = detector.detect('password: "MySecretP@ssw0rd!"');
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.type).toBe('password');
    });

    it('21. detects password= format', () => {
      const result = detector.detect('password=SuperSecretPass123456');
      expect(result.detected).toBe(true);
    });
  });

  // ── Group 9: Private key (2 tests) ─────────────────────────────────────

  describe('private key detection', () => {
    it('22. detects RSA private key', () => {
      const result = detector.detect(
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
      );
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.type).toBe('private_key');
    });

    it('23. detects EC private key', () => {
      const result = detector.detect(
        '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEE\n-----END EC PRIVATE KEY-----',
      );
      expect(result.detected).toBe(true);
    });
  });

  // ── Group 10: Redaction (3 tests) ──────────────────────────────────────

  describe('redaction', () => {
    it('24. redacts detected secrets', () => {
      const content =
        'API_KEY=sk-abc123def456ghi789jkl012 and also ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij1234';
      const result = detector.detect(content);
      expect(result.redactedContent).toBeDefined();
      expect(result.redactedContent).toContain('[REDACTED:');
      expect(result.redactedContent).not.toContain('sk-abc');
    });

    it('25. redaction preserves surrounding text', () => {
      const content = 'Before sk-abc123def456ghi789jkl012 after';
      const result = detector.detect(content);
      expect(result.redactedContent).toContain('Before');
      expect(result.redactedContent).toContain('after');
    });

    it('26. no redaction when no secrets', () => {
      const result = detector.detect('Just plain text');
      expect(result.redactedContent).toBeUndefined();
    });
  });

  // ── Group 11: Masking (2 tests) ────────────────────────────────────────

  describe('masking', () => {
    it('27. masked value hides middle chars', () => {
      const result = detector.detect('sk-abc123def456ghi789jkl012');
      const finding = result.findings[0]!;
      expect(finding.maskedValue.length).toBeGreaterThan(0);
      expect(finding.maskedValue).toContain('*');
      // Prefix should be visible
      expect(finding.maskedValue.startsWith('sk-a')).toBe(true);
    });

    it('28. masked value differs from original', () => {
      const result = detector.detect('sk-abc123def456ghi789jkl012');
      expect(result.findings[0]!.maskedValue).not.toBe(result.findings[0]!.value);
    });
  });

  // ── Group 12: Allowlist & custom patterns (2 tests) ────────────────────

  describe('allowlist and custom patterns', () => {
    it('29. allowlist suppresses detection', () => {
      const customDetector = new SecretDetector({
        allowlist: ['sk-abc123def456ghi789jkl012'],
      });
      const result = customDetector.detect('key=sk-abc123def456ghi789jkl012');
      expect(result.detected).toBe(false);
    });

    it('30. custom patterns extend detection', () => {
      const customPattern: SecretPattern = {
        type: 'custom',
        provider: 'custom',
        pattern: /\bMY_SECRET_[A-Z0-9]{10,}\b/g,
        confidence: 0.8,
        description: 'Custom App Secret',
      };
      const customDetector = new SecretDetector({ customPatterns: [customPattern] });
      const result = customDetector.detect('token=MY_SECRET_ABCDEFGHIJ1234');
      expect(result.detected).toBe(true);
      expect(result.findings[0]!.provider).toBe('custom');
    });
  });
});
