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

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}
import { join } from 'node:path';
import { registerNative, unregisterNative } from '@ghita/native-bridge';
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
    const finding = must(findings[0]);
    expect(finding.ruleId).toBe('GHITA-SEC-001');
    expect(finding.severity.level).toBe('critical');
    expect(finding.locations[0]).toMatchObject({ path: 'src/app.ts', startLine: 1 });
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
    const findings = scanner.scanContent(
      'client.ts',
      'const agent = { rejectUnauthorized: false };',
    );
    expect(findings.some((f) => f.ruleId === 'GHITA-SEC-032')).toBe(true);
  });

  it('produces deterministic fingerprints for identical evidence', () => {
    const line = "const t = 'ghp_0123456789abcdef0123456789abcdef0123';";
    const a = scanner.scanContent('x.ts', line);
    const b = scanner.scanContent('x.ts', line);
    const fa = must(a[0]);
    const fb = must(b[0]);
    expect(fa.fingerprints.primary).toBe(fb.fingerprints.primary);
    expect(fa.fingerprints.algorithm).toBe('ghita-scanner/v1');
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
    writeFileSync(join(dir, 'src', 'a.ts'), 'eval(x);\n');
    writeFileSync(join(dir, 'other.ts'), 'eval(y);\n');
    const scanner = new SecurityScanner();
    const report = await scanner.scan(dir, { target: ['src'] });
    expect(report.coverage.mode).toBe('scoped_path');
    expect(
      report.findings.findings.every((f) => (f.locations[0]?.path ?? '').startsWith('src/')),
    ).toBe(true);
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

describe('SecurityScanner.scanContentFast (v1.1.0 Track 8 A3)', () => {
  let scanner: SecurityScanner;

  beforeEach(() => {
    SecurityScanner.forceJsScanFast = true; // parity vs lazy-line: ép JS fast path
    scanner = new SecurityScanner();
  });

  afterEach(() => {
    SecurityScanner.forceJsScanFast = false;
  });

  it('produces the same findings as the lazy-line scan on a sample', () => {
    const content = [
      "const key = 'sk-proj-abcdef1234567890abcdef1234567890';",
      'password = "super-secret-value-1"',
      'const normal = compute(values, index);',
      'AWS_ACCESS_KEY=AKIAABCDEFGHIJ123456',
      '// just a comment',
    ].join('\n');
    const slow = scanner.scanContent('src/app.ts', content);
    const fast = scanner.scanContentFast('src/app.ts', content);
    expect(fast.length).toBe(slow.length);
    expect(fast.length).toBeGreaterThan(0);
    // Rule ids and line numbers agree.
    const slowKeys = slow.map((f) => `${f.ruleId}:${f.locations[0]?.startLine}`).sort();
    const fastKeys = fast.map((f) => `${f.ruleId}:${f.locations[0]?.startLine}`).sort();
    expect(fastKeys).toEqual(slowKeys);
  });

  it('handles empty and huge single-line content', () => {
    expect(scanner.scanContentFast('a.ts', '')).toHaveLength(0);
    const minified = 'const x=1;'.repeat(500); // > 2000 chars single line
    expect(scanner.scanContentFast('a.ts', minified)).toHaveLength(0);
  });
});

describe('SecurityScanner.scanContentFast — native addon path (v1.1.0 Track 8 A7)', () => {
  let scanner: SecurityScanner;

  beforeEach(() => {
    scanner = new SecurityScanner();
  });

  afterEach(() => {
    unregisterNative('secscan'); // isolation: các test khác tiếp tục dùng JS path
  });

  it('uses the native scan_fast when the addon is registered', () => {
    registerNative('secscan', {
      scanFast: (
        content: string,
        rules: Array<{ id: string; pattern: string; negative?: string }>,
      ) => {
        // Fake native: regex-crate-like semantics (compile pattern sources).
        const lines: number[] = [];
        const ruleIndices: number[] = [];
        const evidence: string[] = [];
        const textLines = content.split('\n');
        textLines.forEach((line, idx) => {
          rules.forEach((rule, ridx) => {
            const re = new RegExp(rule.pattern);
            const neg = rule.negative ? new RegExp(rule.negative) : null;
            if (re.test(line) && !(neg && neg.test(line))) {
              lines.push(idx + 1);
              ruleIndices.push(ridx);
              evidence.push(line.trim());
            }
          });
        });
        return {
          lines: new Uint32Array(lines),
          ruleIndices: new Uint32Array(ruleIndices),
          evidence,
        };
      },
    } as never);

    const content = [
      "const key = 'sk-proj-abcdef1234567890abcdef1234567890';",
      'const normal = compute(values);',
      'BEGIN RSA PRIVATE KEY',
    ].join('\n');
    const findings = scanner.scanContentFast('src/app.ts', content);
    expect(findings.length).toBeGreaterThan(0);
    const keys = findings.map((f) => `${f.ruleId}:${f.locations[0]?.startLine}`).sort();
    expect(keys).toContain('GHITA-SEC-001:1'); // sk- rule on line 1 (native path)
  });
});
