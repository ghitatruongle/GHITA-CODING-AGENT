// ==============================================================================
// v0.4.9 A1: SecurityScanner Unit Tests
//
// Covers the local rule-based scanner:
//   • in-memory content scanning (scanContent) per rule category
//   • false-positive suppression via negativePattern + file-extension gating
//   • filesystem scan with exclusion of artifact dirs and path targets
//   • deterministic fingerprints, severity counts, and score computation
//   • target normalization + path-traversal rejection
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecurityScanner, InvalidScanTargetError } from '../src/scanner/index.js';

describe('SecurityScanner.scanContent', () => {
  let scanner: SecurityScanner;

  beforeEach(() => {
    scanner = new SecurityScanner();
  });

  it('detects a hardcoded OpenAI key', () => {
    const findings = scanner.scanContent(
      'src/app.ts',
      "const key = 'sk-proj-abcdef1234567890abcdef1234567890';",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('GHITA-SEC-001');
    expect(findings[0]!.severity.level).toBe('critical');
    expect(findings[0]!.locations[0]).toMatchObject({ path: 'src/app.ts', startLine: 1 });
  });

  it('suppresses key finding on obvious placeholders', () => {
    const findings = scanner.scanContent(
      'src/app.ts',
      "const key = 'sk-your-key-placeholder-xxxxxxxxxxxx';",
    );
    expect(findings).toHaveLength(0);
  });

  it('detects eval() only in code files, not markdown', () => {
    const inCode = scanner.scanContent('a.ts', 'const r = eval(userInput);');
    expect(inCode.some((f) => f.ruleId === 'GHITA-SEC-010')).toBe(true);

    const inMd = scanner.scanContent('a.md', 'Use eval( ) carefully.');
    expect(inMd).toHaveLength(0);
  });

  it('flags dangerouslySetInnerHTML only in tsx/jsx', () => {
    const tsx = scanner.scanContent(
      'C.tsx',
      'return <div dangerouslySetInnerHTML={{ __html: raw }} />;',
    );
    expect(tsx.some((f) => f.ruleId === 'GHITA-SEC-020')).toBe(true);

    const ts = scanner.scanContent('C.ts', 'const x = { dangerouslySetInnerHTML: {} };');
    expect(ts.some((f) => f.ruleId === 'GHITA-SEC-020')).toBe(false);
  });

  it('detects disabled TLS verification', () => {
    const findings = scanner.scanContent('client.ts', 'const agent = { rejectUnauthorized: false };');
    expect(findings.some((f) => f.ruleId === 'GHITA-SEC-032')).toBe(true);
  });

  it('produces deterministic fingerprints for identical evidence', () => {
    const line = "const t = 'ghp_0123456789abcdef0123456789abcdef0123';";
    const a = scanner.scanContent('x.ts', line);
    const b = scanner.scanContent('x.ts', line);
    expect(a[0]!.fingerprints.primary).toBe(b[0]!.fingerprints.primary);
    expect(a[0]!.fingerprints.algorithm).toBe('ghita-scanner/v1');
  });

  it('ignores excessively long (minified) lines', () => {
    const longLine = `const x = "${'a'.repeat(2100)}"; eval(x);`;
    const findings = scanner.scanContent('bundle.js', longLine);
    expect(findings).toHaveLength(0);
  });
});

describe('SecurityScanner.scan (filesystem)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ghita-scan-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('scans a repository and reports findings + score', async () => {
    writeFileSync(join(dir, 'safe.ts'), 'export const answer = 42;\n');
    writeFileSync(join(dir, 'leak.ts'), "const k = 'sk-abcdef1234567890abcdef1234567890';\n");
    const scanner = new SecurityScanner();
    const report = await scanner.scan(dir);

    expect(report.findings.findings.length).toBeGreaterThanOrEqual(1);
    expect(report.summary.counts.critical).toBeGreaterThanOrEqual(1);
    expect(report.summary.score).toBeLessThan(100);
    expect(report.coverage.mode).toBe('repository');
    expect(report.coverage.completeness).toBe('complete');
  });

  it('excludes node_modules and dist directories', async () => {
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'evil.ts'),
      "const k = 'sk-abcdef1234567890abcdefABCD1234567890';\n",
    );
    writeFileSync(join(dir, 'clean.ts'), 'export const ok = true;\n');
    const scanner = new SecurityScanner();
    const report = await scanner.scan(dir);
    expect(report.findings.findings).toHaveLength(0);
    expect(report.summary.score).toBe(100);
  });

  it('supports scoped path targets', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'a.ts'), "eval(x);\n");
    writeFileSync(join(dir, 'other.ts'), "eval(y);\n");
    const scanner = new SecurityScanner();
    const report = await scanner.scan(dir, { target: ['src'] });
    expect(report.coverage.mode).toBe('scoped_path');
    expect(report.findings.findings.every((f) => f.locations[0]!.path.startsWith('src/'))).toBe(true);
  });

  it('rejects path targets outside the repository', async () => {
    const scanner = new SecurityScanner();
    await expect(scanner.scan(dir, { target: ['../..'] })).rejects.toBeInstanceOf(
      InvalidScanTargetError,
    );
  });

  it('rejects a non-directory repository', async () => {
    const file = join(dir, 'file.ts');
    writeFileSync(file, 'x');
    const scanner = new SecurityScanner();
    await expect(scanner.scan(file)).rejects.toBeInstanceOf(InvalidScanTargetError);
  });

  it('honors an abort signal', async () => {
    writeFileSync(join(dir, 'a.ts'), 'export const x = 1;\n');
    const controller = new AbortController();
    controller.abort();
    const scanner = new SecurityScanner();
    await expect(scanner.scan(dir, { signal: controller.signal })).rejects.toBeTruthy();
  });
});
