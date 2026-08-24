import { describe, expect, it } from 'vitest';
import { buildSarifLog, computeClassHash, safeFence, renderFindingMarkdown } from './sarif.js';
import type { FindingForSarif } from './sarif.js';

describe('computeClassHash', () => {
  it('produces deterministic hash for same inputs', () => {
    const h1 = computeClassHash('sqli', 'api/handler.ts', ['const q = req.query.id', 'db.exec(q)']);
    const h2 = computeClassHash('sqli', 'api/handler.ts', ['const q = req.query.id', 'db.exec(q)']);
    expect(h1).toBe(h2);
  });

  it('differs when rule changes', () => {
    const h1 = computeClassHash('sqli', 'f.ts', ['line1']);
    const h2 = computeClassHash('xss', 'f.ts', ['line1']);
    expect(h1).not.toBe(h2);
  });

  it('differs when context lines change', () => {
    const h1 = computeClassHash('rce', 'f.ts', ['eval(input)']);
    const h2 = computeClassHash('rce', 'f.ts', ['safeEval(input)']);
    expect(h1).not.toBe(h2);
  });

  it('returns 8-char hex string', () => {
    const h = computeClassHash('test', 'f.ts', ['a']);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('buildSarifLog', () => {
  const findings: FindingForSarif[] = [
    {
      ruleId: 'sk-key',
      filePath: 'src/config.ts',
      line: 42,
      evidence: "const key = 'sk-proj-abc'",
      severity: 'high',
      contextLines: ["const key = 'sk-proj-abc'"],
    },
    {
      ruleId: 'private-key',
      filePath: 'certs/server.pem',
      line: 1,
      evidence: '-----BEGIN PRIVATE KEY-----',
      severity: 'critical',
      contextLines: ['-----BEGIN PRIVATE KEY-----'],
    },
  ];

  it('produces valid SARIF 2.1.0 structure', () => {
    const log = buildSarifLog(findings);
    expect(log.version).toBe('2.1.0');
    expect(log.$schema).toContain('sarif-schema-2.1.0');
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0]?.tool.driver.name).toBe('ghita-secscan');
  });

  it('includes partialFingerprints with classHash', () => {
    const log = buildSarifLog(findings);
    const result = log.runs[0]?.results[0];
    expect(result?.partialFingerprints?.classHash).toMatch(/^[0-9a-f]{8}$/);
    expect(result?.partialFingerprints?.ruleAndPath).toMatch(/^[0-9a-f]{8}$/);
  });

  it('maps severity to correct SARIF level', () => {
    const log = buildSarifLog(findings);
    expect(log.runs[0]?.results[0]?.level).toBe('error'); // high → error
    expect(log.runs[0]?.results[1]?.level).toBe('error'); // critical → error
  });

  it('deduplicates rules', () => {
    const dup: FindingForSarif[] = [
      { ruleId: 'sk-key', filePath: 'a.ts', line: 1, evidence: 'e', severity: 'low' },
      { ruleId: 'sk-key', filePath: 'b.ts', line: 2, evidence: 'e', severity: 'low' },
    ];
    const log = buildSarifLog(dup);
    expect(log.runs[0]?.tool.driver.rules).toHaveLength(1);
  });

  it('includes validation receipt properties when present', () => {
    const withReceipt: FindingForSarif[] = [
      {
        ruleId: 'sqli',
        filePath: 'api.ts',
        line: 10,
        evidence: 'query concat',
        severity: 'high',
        receipt: {
          id: 'vr-test',
          findingRuleId: 'sqli',
          filePath: 'api.ts',
          line: 10,
          method: 'static',
          evidence: 'source→sink',
          proofGaps: ['reachability'],
          disposition: 'reportable',
          survivesRescan: false,
          validatedAt: Date.now(),
        },
      },
    ];
    const log = buildSarifLog(withReceipt);
    const props = log.runs[0]?.results[0]?.properties;
    expect(props?.validationMethod).toBe('static');
    expect(props?.disposition).toBe('reportable');
  });
});

describe('safeFence', () => {
  it('wraps plain text in triple backticks', () => {
    const result = safeFence('hello world');
    expect(result.startsWith('```')).toBe(true);
    expect(result.endsWith('```')).toBe(true);
    expect(result).toContain('hello world');
  });

  it('uses longer fence when content contains triple backticks', () => {
    const content = 'some ```code``` here';
    const result = safeFence(content);
    // Fence must be at least 4 backticks
    const firstLine = result.split('\n')[0] ?? '';
    expect(firstLine.length).toBeGreaterThanOrEqual(4);
    // Content must appear inside
    expect(result).toContain('some ```code``` here');
  });

  it('handles content with many backticks', () => {
    const content = '````` five backticks `````';
    const result = safeFence(content);
    const firstLine = result.split('\n')[0] ?? '';
    expect(firstLine.length).toBeGreaterThan(5);
  });

  it('includes language specifier', () => {
    const result = safeFence('code', 'typescript');
    expect(result.startsWith('```typescript')).toBe(true);
  });

  it('does not allow fence escape with crafted content', () => {
    // Attacker tries to close the fence early
    const malicious = 'innocent\n```\n# Injected heading\n```';
    const result = safeFence(malicious);
    // The result should use a 4-backtick fence, so internal ``` cannot close it
    const lines = result.split('\n');
    expect(lines[0]).toBe('````');
    expect(lines[lines.length - 1]).toBe('````');
  });
});

describe('renderFindingMarkdown', () => {
  it('renders finding with all fields', () => {
    const md = renderFindingMarkdown({
      ruleId: 'xss',
      filePath: 'view.tsx',
      line: 55,
      evidence: '<script>alert(1)</script>',
      severity: 'high',
    });
    expect(md).toContain('### Finding: `xss`');
    expect(md).toContain('`view.tsx`');
    expect(md).toContain('55');
    expect(md).toContain('Unvalidated');
  });

  it('renders validated finding without unvalidated warning', () => {
    const md = renderFindingMarkdown({
      ruleId: 'sqli',
      filePath: 'api.ts',
      line: 10,
      evidence: 'query concat',
      severity: 'medium',
      receipt: {
        id: 'vr-1',
        findingRuleId: 'sqli',
        filePath: 'api.ts',
        line: 10,
        method: 'confirmed',
        evidence: 'verified',
        proofGaps: [],
        disposition: 'reportable',
        survivesRescan: true,
        validatedAt: Date.now(),
      },
    });
    expect(md).toContain('confirmed');
    expect(md).toContain('reportable');
    expect(md).not.toContain('Unvalidated');
  });
});
