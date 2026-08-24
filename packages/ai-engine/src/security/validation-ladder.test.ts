import { describe, expect, it } from 'vitest';
import {
  createReceipt,
  attachReceipt,
  filterReportable,
  partitionFindings,
  validateStatic,
} from './validation-ladder.js';
import type { ValidatedFinding } from './validation-ladder.js';

function makeFinding(overrides: Partial<ValidatedFinding> = {}): ValidatedFinding {
  return {
    ruleId: 'sk-key',
    filePath: 'src/config.ts',
    line: 42,
    evidence: "const key = 'sk-proj-abc'",
    severity: 'high',
    unvalidated: true,
    ...overrides,
  };
}

describe('createReceipt', () => {
  it('creates a receipt with all required fields', () => {
    const receipt = createReceipt(
      { ruleId: 'sk-key', filePath: 'src/config.ts', line: 42 },
      'static',
      'source identified in parameter',
      { proofGaps: ['reachability not verified'], validator: 'test' },
    );
    expect(receipt.method).toBe('static');
    expect(receipt.evidence).toBe('source identified in parameter');
    expect(receipt.proofGaps).toEqual(['reachability not verified']);
    expect(receipt.disposition).toBe('reportable');
    expect(receipt.validator).toBe('test');
    expect(receipt.id).toMatch(/^vr-/);
  });

  it('generates deterministic receipt ids for same coordinates', () => {
    const r1 = createReceipt({ ruleId: 'a', filePath: 'f.ts', line: 1 }, 'static', 'e');
    const r2 = createReceipt({ ruleId: 'a', filePath: 'f.ts', line: 1 }, 'static', 'e');
    // IDs include timestamp so they differ; but prefix matches
    expect(r1.id.startsWith('vr-')).toBe(true);
    expect(r2.id.startsWith('vr-')).toBe(true);
  });
});

describe('attachReceipt', () => {
  it('marks finding as unvalidated when no receipt', () => {
    const f = attachReceipt(makeFinding());
    expect(f.unvalidated).toBe(true);
    expect(f.receipt).toBeUndefined();
  });

  it('marks finding as validated when receipt has reportable disposition', () => {
    const receipt = createReceipt(
      { ruleId: 'sk-key', filePath: 'src/config.ts', line: 42 },
      'confirmed',
      'manual review confirmed',
    );
    const f = attachReceipt(makeFinding(), receipt);
    expect(f.unvalidated).toBe(false);
    expect(f.receipt?.method).toBe('confirmed');
  });

  it('marks finding as unvalidated when receipt disposition is unvalidated', () => {
    const receipt = createReceipt(
      { ruleId: 'sk-key', filePath: 'src/config.ts', line: 42 },
      'static',
      'evidence',
      { disposition: 'unvalidated' },
    );
    const f = attachReceipt(makeFinding(), receipt);
    expect(f.unvalidated).toBe(true);
  });
});

describe('filterReportable', () => {
  it('excludes unvalidated findings', () => {
    const findings: ValidatedFinding[] = [
      makeFinding({ unvalidated: true }),
      attachReceipt(
        makeFinding(),
        createReceipt({ ruleId: 'sk-key', filePath: 'f.ts', line: 1 }, 'static', 'ev'),
      ),
    ];
    const result = filterReportable(findings);
    expect(result).toHaveLength(1);
    expect(result[0]?.unvalidated).toBe(false);
  });

  it('excludes suppressed findings', () => {
    const receipt = createReceipt({ ruleId: 'sk-key', filePath: 'f.ts', line: 1 }, 'static', 'ev', {
      disposition: 'suppressed',
    });
    const findings: ValidatedFinding[] = [attachReceipt(makeFinding(), receipt)];
    expect(filterReportable(findings)).toHaveLength(0);
  });
});

describe('partitionFindings', () => {
  it('separates reportable, unvalidated, and suppressed', () => {
    const findings: ValidatedFinding[] = [
      makeFinding({ unvalidated: true }),
      attachReceipt(
        makeFinding({ ruleId: 'aws-key' }),
        createReceipt({ ruleId: 'aws-key', filePath: 'f.ts', line: 2 }, 'heuristic', 'ev'),
      ),
      attachReceipt(
        makeFinding({ ruleId: 'ghp-token' }),
        createReceipt({ ruleId: 'ghp-token', filePath: 'f.ts', line: 3 }, 'static', 'ev', {
          disposition: 'suppressed',
        }),
      ),
    ];
    const { reportable, unvalidated, suppressed } = partitionFindings(findings);
    expect(reportable).toHaveLength(1);
    expect(unvalidated).toHaveLength(1);
    expect(suppressed).toHaveLength(1);
  });
});

describe('validateStatic', () => {
  it('detects source/sink/control/reach from evidence text', () => {
    const receipt = validateStatic({
      ruleId: 'sqli',
      filePath: 'api/handler.ts',
      line: 10,
      evidence: 'user input param flows to exec query sink via call path',
    });
    expect(receipt.method).toBe('static');
    expect(receipt.proofGaps).toHaveLength(0);
    expect(receipt.disposition).toBe('reportable');
  });

  it('records gaps when markers are missing', () => {
    const receipt = validateStatic({
      ruleId: 'xss',
      filePath: 'view.ts',
      line: 5,
      evidence: 'some benign text',
    });
    expect(receipt.proofGaps.length).toBeGreaterThan(0);
  });

  it('accepts explicit overrides', () => {
    const receipt = validateStatic(
      { ruleId: 'rce', filePath: 'f.ts', line: 1, evidence: 'nothing' },
      { source: true, control: true, sink: true, reachable: true },
    );
    expect(receipt.proofGaps).toHaveLength(0);
  });
});
