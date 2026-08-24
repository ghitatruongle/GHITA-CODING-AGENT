// Track 5 P5.3 — cross-implementation secret-detection parity fixtures.
//
// The SAME corpus is mirrored in crates/secscan/src/secrets.rs (module
// `secret_parity_tests`) so drift between the Rust literal rules and the TS
// regex engines surfaces as a test failure on either side. When you add a
// secret format here, add it to the Rust fixture list too.

import { describe, expect, it } from 'vitest';
import { SecretDetector } from '../src/enterprise/secret-detection.js';
import { SECRET_PATTERN_CATALOG } from '../src/middleware/guardrails.js';
import { DEFAULT_SCANNER_RULES } from '@ghita/security';

interface Fixture {
  name: string;
  sample: string;
}

const FIXTURES: Fixture[] = [
  {
    name: 'openai_key',
    sample: 'Authorization: Bearer sk-proj-abcdefghij0123456789ABCDE',
  },
  { name: 'github_pat', sample: 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789' },
  { name: 'aws_access_key', sample: 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE' },
  {
    name: 'private_key_block',
    sample: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
  },
];

describe('secret detection parity (Track 5 P5.3)', () => {
  const detector = new SecretDetector();

  it('enterprise SecretDetector flags every fixture category', () => {
    for (const fixture of FIXTURES) {
      const result = detector.detect(fixture.sample);
      expect(result.detected, `expected detection for ${fixture.name}`).toBe(true);
      expect(result.findings.length, `${fixture.name} should report findings`).toBeGreaterThan(0);
    }
  });

  it('scanner rule set matches each fixture via its dedicated rule', () => {
    for (const fixture of FIXTURES) {
      // At least one scanner rule must fire on the fixture line.
      const matched = DEFAULT_SCANNER_RULES.filter((rule) => {
        if (rule.category !== 'secrets') return false;
        if (!rule.pattern.test(fixture.sample)) return false;
        if (rule.negativePattern?.test(fixture.sample)) return false;
        return true;
      });
      expect(matched.length, `no scanner rule matched ${fixture.name}`).toBeGreaterThan(0);
    }
  });

  it('guardrails catalog covers every category on the corpus (Track 5 P5.3)', () => {
    const CASES: Array<{ name: string; sample: string }> = [
      { name: 'openai_key', sample: 'sk-proj-abcdefghij0123456789ABCDE' },
      { name: 'github_token', sample: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' },
      { name: 'aws_key', sample: 'AKIAIOSFODNN7EXAMPLE' },
      { name: 'google_api_key', sample: 'AIzaSyA1234567890abcdefghijklmnopqrstuv' },
      { name: 'bearer_token', sample: 'Bearer abcdef0123456789abcdef01234567' },
      { name: 'private_key', sample: '-----BEGIN RSA PRIVATE KEY-----' },
      {
        name: 'jwt_token',
        sample:
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      },
    ];

    for (const c of CASES) {
      const entry = SECRET_PATTERN_CATALOG.find((p) => p.name === c.name);
      expect(entry, `missing guardrails catalog entry ${c.name}`).toBeTruthy();
      const re = new RegExp(entry!.regex.source, entry!.regex.flags.replace(/g/g, ""));
      expect(re.test(c.sample), `guardrails pattern ${c.name} did not match its fixture`).toBe(true);
    }
  });

  it('benign content does not trigger any detector', () => {
    const benign = [
      'const greeting = "hello world";',
      'docs say keys look like sk-YOUR_KEY_HERE (placeholder)',
      'see https://example.com/config for setup',
    ];
    for (const line of benign) {
      expect(detector.detect(line).detected, `benign line flagged: ${line}`).toBe(false);
    }
  });
});
