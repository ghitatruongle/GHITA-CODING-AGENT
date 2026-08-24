export interface SkillUsageRecord {
  skillId: string;
  invokedAt: number;
  success: boolean;
  durationMs: number;
  /** User feedback if provided. */
  feedback?: 'positive' | 'negative' | 'neutral';
}

export interface SkillUsageStats {
  skillId: string;
  totalInvocations: number;
  successRate: number;
  avgDurationMs: number;
  lastInvokedAt: number;
  feedbackScore: number; // -1 to 1
}

export class SkillUsageTracker {
  private readonly records = new Map<string, SkillUsageRecord[]>();

  record(record: SkillUsageRecord): void {
    const existing = this.records.get(record.skillId) ?? [];
    existing.push(record);
    this.records.set(record.skillId, existing);
  }

  getStats(skillId: string): SkillUsageStats | null {
    const records = this.records.get(skillId);
    if (!records || records.length === 0) return null;

    const successes = records.filter((r) => r.success).length;
    const totalDuration = records.reduce((sum, r) => sum + r.durationMs, 0);
    const feedbackScores: number[] = records
      .filter((r) => r.feedback)
      .map((r) => (r.feedback === 'positive' ? 1 : r.feedback === 'negative' ? -1 : 0));
    const avgFeedback =
      feedbackScores.length > 0
        ? feedbackScores.reduce((a, b) => a + b, 0) / feedbackScores.length
        : 0;

    return {
      skillId,
      totalInvocations: records.length,
      successRate: successes / records.length,
      avgDurationMs: totalDuration / records.length,
      lastInvokedAt: Math.max(...records.map((r) => r.invokedAt)),
      feedbackScore: avgFeedback,
    };
  }

  getAllStats(): SkillUsageStats[] {
    const stats: SkillUsageStats[] = [];
    for (const skillId of this.records.keys()) {
      const s = this.getStats(skillId);
      if (s) stats.push(s);
    }
    return stats.sort((a, b) => b.totalInvocations - a.totalInvocations);
  }

  /** Identify skills that may need improvement based on low success rate or negative feedback. */
  identifyImprovementCandidates(
    thresholds: {
      minInvocations?: number;
      maxSuccessRate?: number;
      minFeedbackScore?: number;
    } = {},
  ): SkillUsageStats[] {
    const minInv = thresholds.minInvocations ?? 3;
    const maxSR = thresholds.maxSuccessRate ?? 0.7;
    const minFB = thresholds.minFeedbackScore ?? -0.3;

    return this.getAllStats().filter(
      (s) => s.totalInvocations >= minInv && (s.successRate < maxSR || s.feedbackScore < minFB),
    );
  }

  clear(): void {
    this.records.clear();
  }
}

// Quarantine Tier for Auto-Created Skills

export type SkillTier = 'stable' | 'experimental' | 'quarantine';

export interface QuarantinedSkill {
  id: string;
  name: string;
  description: string;
  sourceSessionId: string;
  createdAt: number;
  tier: SkillTier;
  /** Supply-chain scan result. */
  scanPassed: boolean;
  /** Structural lint issues found. */
  lintIssues: LintIssue[];
}

export interface LintIssue {
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  line?: number;
}

/**
 * Structural linter for SKILL.md content.
 * Checks required sections, frontmatter validity, and content quality.
 */
export function lintSkillContent(content: string): LintIssue[] {
  const issues: LintIssue[] = [];

  // Check frontmatter
  if (!content.startsWith('---')) {
    issues.push({
      severity: 'error',
      rule: 'frontmatter-missing',
      message: 'SKILL.md must start with YAML frontmatter (---)',
    });
  } else {
    const endIdx = content.indexOf('---', 3);
    if (endIdx === -1) {
      issues.push({
        severity: 'error',
        rule: 'frontmatter-unclosed',
        message: 'Frontmatter block not closed',
      });
    } else {
      const fm = content.slice(3, endIdx).trim();
      if (!fm.includes('name:')) {
        issues.push({
          severity: 'error',
          rule: 'name-missing',
          message: 'Frontmatter must include "name" field',
        });
      }
      if (!fm.includes('description:')) {
        issues.push({
          severity: 'warning',
          rule: 'description-missing',
          message: 'Frontmatter should include "description" field',
        });
      }
    }
  }

  // Check for required sections
  const lower = content.toLowerCase();
  if (!lower.includes('## usage') && !lower.includes('## how to use')) {
    issues.push({
      severity: 'warning',
      rule: 'usage-section-missing',
      message: 'Consider adding a "## Usage" section',
    });
  }

  // Check for test references
  if (!lower.includes('test') && !lower.includes('example')) {
    issues.push({
      severity: 'info',
      rule: 'no-tests-referenced',
      message: 'No test or example references found',
    });
  }

  // Content length check
  const bodyStart = content.indexOf('---', 3) + 3;
  const body = content.slice(bodyStart).trim();
  if (body.length < 50) {
    issues.push({
      severity: 'warning',
      rule: 'content-too-short',
      message: `Skill body is only ${body.length} chars — consider more detail`,
    });
  }

  return issues;
}

/**
 * Create a quarantined skill from a session trajectory.
 */
export function createQuarantinedSkill(
  sessionId: string,
  name: string,
  description: string,
  content: string,
): QuarantinedSkill {
  const lintIssues = lintSkillContent(content);
  const hasErrors = lintIssues.some((i) => i.severity === 'error');

  return {
    id: `q-${Date.now().toString(36)}`,
    name,
    description,
    sourceSessionId: sessionId,
    createdAt: Date.now(),
    tier: 'quarantine',
    scanPassed: !hasErrors,
    lintIssues,
  };
}

/**
 * Promote a quarantined skill to experimental after passing review.
 */
export function promoteFromQuarantine(skill: QuarantinedSkill): QuarantinedSkill {
  return { ...skill, tier: 'experimental' };
}
