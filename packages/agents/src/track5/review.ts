// Claude-Code-style review: gate check → 4 parallel reviewer roles → second
// validation pass over each finding (blocks false positives) → report.

export interface ReviewContext {
  title: string;
  diff: string;
  /** Optional compliance document (e.g. CLAUDE.md rules). */
  guidelines?: string;
}

export interface ReviewFinding {
  id: string;
  severity: 'critical' | 'warning' | 'suggestion';
  reviewer: string;
  file?: string;
  line?: number;
  message: string;
  /** True when the finding survived the second validation pass. */
  validated?: boolean;
}

export interface Reviewer {
  role: string;
  review: (ctx: ReviewContext) => Promise<ReviewFinding[]>;
}

export interface Validator {
  (finding: ReviewFinding, ctx: ReviewContext): Promise<boolean>;
}

export interface GateCheck {
  (ctx: ReviewContext): Promise<{ passed: boolean; reason: string }>;
}

export interface ReviewReport {
  gated: boolean;
  gateReason?: string;
  findings: ReviewFinding[];
  criticalCount: number;
  validatedCount: number;
  blocked: boolean;
  generatedAt: string;
}

export class PRReviewPipeline {
  constructor(
    private readonly reviewers: Reviewer[],
    private readonly validator: Validator,
    private readonly gate: GateCheck = async () => ({ passed: true, reason: 'no gate configured' }),
  ) {}

  async review(ctx: ReviewContext): Promise<ReviewReport> {
    const gate = await this.gate(ctx);
    if (!gate.passed) {
      return {
        gated: true,
        gateReason: gate.reason,
        findings: [],
        criticalCount: 0,
        validatedCount: 0,
        blocked: true,
        generatedAt: new Date().toISOString(),
      };
    }

    // 1. Parallel review by role.
    const perRole = await Promise.all(
      this.reviewers.map(async (reviewer) => ({
        reviewer,
        findings: await reviewer.review(ctx),
      })),
    );

    // 2. Second pass: validate every finding.
    const findings: ReviewFinding[] = [];
    for (const { reviewer, findings: roleFindings } of perRole) {
      for (const finding of roleFindings) {
        const validated = await this.validator(finding, ctx);
        findings.push({ ...finding, reviewer: reviewer.role, validated });
      }
    }

    const criticalCount = findings.filter((f) => f.severity === 'critical').length;
    const validatedCount = findings.filter((f) => f.validated).length;
    return {
      gated: false,
      findings,
      criticalCount,
      validatedCount,
      blocked: criticalCount > 0,
      generatedAt: new Date().toISOString(),
    };
  }
}

/** Render the review report to markdown (bounded, safe). */
export function renderReviewReport(report: ReviewReport): string {
  const lines: string[] = [];
  lines.push('# Code Review Report');
  lines.push('');
  if (report.gated) {
    lines.push(`> 🚫 Blocked by gate: ${report.gateReason}`);
    return lines.join('\n');
  }
  lines.push(
    `**Findings:** ${report.findings.length} · **Validated:** ${report.validatedCount} · **Critical:** ${report.criticalCount}`,
  );
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('No findings.');
    return lines.join('\n');
  }
  lines.push('| Severity | Reviewer | Finding | Validated |');
  lines.push('|---|---|---|---|');
  for (const f of report.findings) {
    lines.push(
      `| ${f.severity} | ${f.reviewer} | ${truncate(f.message, 80)} | ${f.validated ? '✅' : '—'} |`,
    );
  }
  if (report.blocked) {
    lines.push('');
    lines.push('> Blocked: critical findings present.');
  }
  return lines.join('\n');
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
