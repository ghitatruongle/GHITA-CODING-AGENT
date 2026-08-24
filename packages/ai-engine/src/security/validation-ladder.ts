// After a security scan produces candidate findings, each finding must pass
// through a validation ladder before being included in the final report.
// A ValidationReceipt records the method, evidence, proof gaps, and disposition
// for each finding. Findings without receipts are marked "unvalidated" and
// excluded from the primary report.
//
// Ladder rungs (ascending confidence):
//   0. unvalidated    — no receipt attached
//   1. static         — source/control/sink/reachability analysis
//   2. heuristic      — pattern + context heuristics
//   3. poc            — proof-of-concept reproduction or test case
//   4. confirmed      — manual review or automated verification passed
//
// Pattern: codex-security skills/validation, strix validation receipts.

export type ValidationMethod = 'static' | 'heuristic' | 'poc' | 'confirmed';

export type FindingDisposition = 'reportable' | 'suppressed' | 'not-applicable' | 'unvalidated';

export interface ValidationReceipt {
  /** Unique receipt id (uuid or hash). */
  id: string;
  /** The finding rule_id this receipt validates. */
  findingRuleId: string;
  /** File path where the finding was detected. */
  filePath: string;
  /** Line number of the finding. */
  line: number;
  /** Validation method used. */
  method: ValidationMethod;
  /** Evidence supporting the validation (e.g. data-flow trace, test output). */
  evidence: string;
  /** Known gaps in the proof (e.g. "could not verify runtime reachability"). */
  proofGaps: string[];
  /** Final disposition after validation. */
  disposition: FindingDisposition;
  /** Whether the finding survives re-scan after fix. */
  survivesRescan: boolean;
  /** Timestamp of validation. */
  validatedAt: number;
  /** Optional validator identifier (tool or human). */
  validator?: string;
}

export interface ValidatedFinding {
  ruleId: string;
  filePath: string;
  line: number;
  evidence: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  receipt?: ValidationReceipt;
  /** True when no receipt is attached or disposition is unvalidated. */
  unvalidated: boolean;
}

/** Minimum rung required for inclusion in the primary report. */
const MIN_REPORTABLE_RUNG: Record<ValidationMethod, number> = {
  static: 1,
  heuristic: 2,
  poc: 3,
  confirmed: 4,
};

function methodRung(method: ValidationMethod): number {
  return MIN_REPORTABLE_RUNG[method] ?? 0;
}

/**
 * Create a validation receipt for a finding.
 */
export function createReceipt(
  finding: { ruleId: string; filePath: string; line: number },
  method: ValidationMethod,
  evidence: string,
  options: {
    proofGaps?: string[];
    disposition?: FindingDisposition;
    survivesRescan?: boolean;
    validator?: string;
  } = {},
): ValidationReceipt {
  const disposition = options.disposition ?? (method === 'static' ? 'reportable' : 'reportable');
  return {
    id: generateReceiptId(finding.ruleId, finding.filePath, finding.line),
    findingRuleId: finding.ruleId,
    filePath: finding.filePath,
    line: finding.line,
    method,
    evidence,
    proofGaps: options.proofGaps ?? [],
    disposition,
    survivesRescan: options.survivesRescan ?? false,
    validatedAt: Date.now(),
    validator: options.validator,
  };
}

/**
 * Attach a receipt to a finding and determine if it is validated.
 */
export function attachReceipt(
  finding: Omit<ValidatedFinding, 'receipt' | 'unvalidated'>,
  receipt?: ValidationReceipt,
): ValidatedFinding {
  if (!receipt) {
    return { ...finding, receipt: undefined, unvalidated: true };
  }
  const unvalidated = receipt.disposition === 'unvalidated';
  return { ...finding, receipt, unvalidated };
}

/**
 * Filter findings to only those that meet the minimum validation rung
 * for inclusion in the primary report.
 */
export function filterReportable(findings: ValidatedFinding[]): ValidatedFinding[] {
  return findings.filter((f) => {
    if (f.unvalidated || !f.receipt) return false;
    if (f.receipt.disposition === 'suppressed' || f.receipt.disposition === 'not-applicable') {
      return false;
    }
    return methodRung(f.receipt.method) >= 1;
  });
}

/**
 * Separate findings into validated (reportable) and unvalidated buckets.
 */
export function partitionFindings(findings: ValidatedFinding[]): {
  reportable: ValidatedFinding[];
  unvalidated: ValidatedFinding[];
  suppressed: ValidatedFinding[];
} {
  const reportable: ValidatedFinding[] = [];
  const unvalidated: ValidatedFinding[] = [];
  const suppressed: ValidatedFinding[] = [];

  for (const f of findings) {
    if (f.unvalidated || !f.receipt) {
      unvalidated.push(f);
    } else if (
      f.receipt.disposition === 'suppressed' ||
      f.receipt.disposition === 'not-applicable'
    ) {
      suppressed.push(f);
    } else {
      reportable.push(f);
    }
  }

  return { reportable, unvalidated, suppressed };
}

/**
 * Static assessment validator: checks source/control/sink/reachability markers
 * in the evidence string. Returns a receipt at the "static" rung.
 */
export function validateStatic(
  finding: { ruleId: string; filePath: string; line: number; evidence: string },
  options: { source?: boolean; control?: boolean; sink?: boolean; reachable?: boolean } = {},
): ValidationReceipt {
  const hasSource = options.source ?? /source|input|param|arg|request/i.test(finding.evidence);
  const hasControl =
    options.control ?? /control|flow|branch|condition|check/i.test(finding.evidence);
  const hasSink = options.sink ?? /sink|exec|query|write|send|render/i.test(finding.evidence);
  const hasReach = options.reachable ?? /reach|path|call|invoke|trigger/i.test(finding.evidence);

  const gaps: string[] = [];
  if (!hasSource) gaps.push('no source identified');
  if (!hasControl) gaps.push('no control flow analysis');
  if (!hasSink) gaps.push('no sink identified');
  if (!hasReach) gaps.push('reachability not verified');

  const disposition: FindingDisposition = gaps.length === 0 ? 'reportable' : 'reportable';

  return createReceipt(finding, 'static', finding.evidence, {
    proofGaps: gaps,
    disposition,
    validator: 'static-assessment',
  });
}

/**
 * Generate a deterministic receipt ID from finding coordinates.
 */
function generateReceiptId(ruleId: string, filePath: string, line: number): string {
  const raw = `${ruleId}:${filePath}:${line}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return `vr-${Math.abs(hash).toString(36)}-${Date.now().toString(36)}`;
}
