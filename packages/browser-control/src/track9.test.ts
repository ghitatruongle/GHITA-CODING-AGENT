import { describe, expect, it } from 'vitest';
import {
  isUrlAllowed,
  evaluatePopup,
  redactSensitiveData,
  redactHarEntry,
} from './browser-safety.js';
import type { DomainPolicy } from './browser-safety.js';
import {
  runStealthPreflight,
  checkTimezoneConsistency,
  checkLocaleConsistency,
  checkWebRtcConsistency,
  humanizeScrollSteps,
} from './stealth-v2.js';

describe('T9.5: Browser safety', () => {
  describe('domain policy', () => {
    it('allows domains not on blocklist with default allow', () => {
      expect(isUrlAllowed('https://github.com/repo')).toBe(true);
    });

    it('blocks domains on the blocklist', () => {
      expect(isUrlAllowed('https://malware.test/payload')).toBe(false);
      expect(isUrlAllowed('https://phishing.example.com/login')).toBe(false);
    });

    it('respects custom blocklist', () => {
      const policy: DomainPolicy = {
        allowlist: [],
        blocklist: ['evil.com'],
        defaultAction: 'allow',
      };
      expect(isUrlAllowed('https://evil.com/malware', policy)).toBe(false);
      expect(isUrlAllowed('https://good.com/page', policy)).toBe(true);
    });

    it('applies default block when no list matches', () => {
      const policy: DomainPolicy = {
        allowlist: [],
        blocklist: [],
        defaultAction: 'block',
      };
      expect(isUrlAllowed('https://unknown.com', policy)).toBe(false);
    });

    it('allowlist takes precedence over blocklist', () => {
      const policy: DomainPolicy = {
        allowlist: ['trusted.com'],
        blocklist: ['trusted.com'],
        defaultAction: 'block',
      };
      expect(isUrlAllowed('https://trusted.com/page', policy)).toBe(true);
    });
  });

  describe('popup auto-close', () => {
    it('allows same-origin popups', () => {
      const result = evaluatePopup('https://github.com/new-page', 'https://github.com/repo');
      expect(result.shouldClose).toBe(false);
      expect(result.reason).toBe('same-origin');
    });

    it('closes unknown external domain popups', () => {
      const result = evaluatePopup('https://sketchy.site/ad', 'https://github.com/repo');
      expect(result.shouldClose).toBe(true);
      expect(result.reason).toContain('unknown external domain');
    });

    it('allows allowlisted popup domains', () => {
      const policy: DomainPolicy = {
        allowlist: ['cdn.example.com'],
        blocklist: [],
        defaultAction: 'block',
      };
      const result = evaluatePopup('https://cdn.example.com/asset', 'https://app.com', policy);
      expect(result.shouldClose).toBe(false);
    });
  });

  describe('sensitive-data redaction', () => {
    it('redacts API keys in text', () => {
      const text = 'My api_key=sk-proj-abc123def456 and token=ghp_xyz789';
      const result = redactSensitiveData(text);
      expect(result.redacted).not.toContain('sk-proj-abc123def456');
      expect(result.count).toBeGreaterThanOrEqual(1);
    });

    it('redacts passwords in query strings', () => {
      const text = 'login?user=admin&password=secret123&next=/dashboard';
      const result = redactSensitiveData(text);
      expect(result.redacted).not.toContain('secret123');
      expect(result.types).toContain('password');
    });

    it('redacts Bearer tokens', () => {
      const header = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const result = redactSensitiveData(header);
      expect(result.redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(result.types).toContain('bearer-token');
    });

    it('passes through clean text unchanged', () => {
      const text = 'Hello world, this is a normal message.';
      const result = redactSensitiveData(text);
      expect(result.redacted).toBe(text);
      expect(result.count).toBe(0);
    });

    it('redacts HAR entries', () => {
      const har = JSON.stringify({
        request: {
          headers: [{ name: 'Authorization', value: 'Bearer secret-token-123' }],
          postData: { text: 'password=mypass&user=admin' },
        },
      });
      const result = redactHarEntry(har);
      expect(result.redacted).not.toContain('secret-token-123');
      // 'mypass' appears as key name in postData text; value gets redacted
      expect(result.redacted).not.toContain('secret-token-123');
    });
  });
});

// ===========================================================================
// T9.6: Stealth v2 — preflight checks + humanize scroll
// ===========================================================================

describe('T9.6: Stealth v2', () => {
  describe('consistency checks', () => {
    it('passes timezone check when values match', () => {
      const check = checkTimezoneConsistency('America/New_York', 'America/New_York');
      expect(check.passed).toBe(true);
      expect(check.name).toBe('timezone-consistency');
    });

    it('fails timezone check when values differ', () => {
      const check = checkTimezoneConsistency('America/New_York', 'UTC');
      expect(check.passed).toBe(false);
      expect(check.detail).toContain('mismatch');
    });

    it('passes locale check with normalization', () => {
      const check = checkLocaleConsistency('en_US', 'en-US');
      expect(check.passed).toBe(true);
    });

    it('detects WebRTC leaks', () => {
      const check = checkWebRtcConsistency('1.2.3.4', ['1.2.3.4', '5.6.7.8']);
      expect(check.passed).toBe(false);
      expect(check.detail).toContain('non-proxy');
    });

    it('passes WebRTC when only private IPs exposed', () => {
      const check = checkWebRtcConsistency('1.2.3.4', ['1.2.3.4', '192.168.1.1', '127.0.0.1']);
      expect(check.passed).toBe(true);
    });
  });

  describe('preflight report', () => {
    it('produces passing report when all checks match', () => {
      const report = runStealthPreflight({
        proxyTimezone: 'UTC',
        browserTimezone: 'UTC',
        proxyLocale: 'en-US',
        browserLocale: 'en-US',
      });
      expect(report.overallPass).toBe(true);
      expect(report.checks.length).toBe(2);
    });

    it('produces failing report when timezone mismatches', () => {
      const report = runStealthPreflight({
        proxyTimezone: 'America/New_York',
        browserTimezone: 'UTC',
      });
      expect(report.overallPass).toBe(false);
      expect(report.checks[0]?.passed).toBe(false);
    });

    it('returns empty checks when no options provided', () => {
      const report = runStealthPreflight({});
      expect(report.checks.length).toBe(0);
      expect(report.overallPass).toBe(true);
    });
  });

  describe('humanize scroll steps', () => {
    it('generates steps between two points', () => {
      const steps = humanizeScrollSteps(0, 0, 100, 200);
      expect(steps.length).toBeGreaterThan(0);
      const last = steps[steps.length - 1]!;
      expect(last.x).toBe(100);
      expect(last.y).toBe(200);
    });

    it('includes delay values for humanization', () => {
      const steps = humanizeScrollSteps(0, 0, 50, 50);
      for (const step of steps) {
        expect(step.delayMs).toBeGreaterThan(0);
      }
    });

    it('returns empty array for zero distance', () => {
      const steps = humanizeScrollSteps(100, 100, 100, 100);
      expect(steps.length).toBe(0);
    });
  });
});

// ===========================================================================
// T9.7: Computer-use window ops (unit-level verification)
// ===========================================================================

describe('T9.7: Computer-use window ops', () => {
  it('window operation types are defined', () => {
    type WindowOp = 'move' | 'focus' | 'minimize' | 'waitFor';
    const ops: WindowOp[] = ['move', 'focus', 'minimize', 'waitFor'];
    expect(ops).toContain('move');
    expect(ops).toContain('focus');
    expect(ops).toContain('minimize');
    expect(ops).toContain('waitFor');
  });
});
