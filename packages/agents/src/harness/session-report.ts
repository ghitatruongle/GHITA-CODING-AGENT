// ==============================================================================
// v0.4.9 A3: Agent Work Loop Harness — Session Evidence Report
//
// Renders a WorkLoopReview into a durable, reader-safe Markdown report. No raw
// prompts, commands, paths, or secrets are emitted — only bounded summaries.
// ==============================================================================

import type { WorkLoopReview } from './types.js';

const DIMENSION_LABELS: Record<string, string> = {
  'task-understanding': 'Task Understanding',
  'controlled-execution': 'Controlled Execution',
  'change-validation': 'Change Validation',
  'reliable-delivery': 'Reliable Delivery',
  'learning-capture': 'Learning Capture',
};

/**
 * Render a WorkLoopReview into a Markdown session-evidence report.
 */
export function renderSessionReport(review: WorkLoopReview): string {
  const lines: string[] = [];
  lines.push(`# Agent Work Loop Report — ${review.episodeId}`);
  lines.push('');
  lines.push(`**Goal:** ${review.goal}`);
  lines.push(`**Loop Effectiveness:** ${review.loopEffectiveness}/100`);
  if (review.sessionLimited) {
    lines.push('');
    lines.push('> ⚠️ `session-limited` review — some behavior remained Unobserved.');
  }
  lines.push('');

  lines.push('## Dimensions');
  lines.push('');
  lines.push('| Dimension | Score | Highest evidence | Ceiling |');
  lines.push('| --- | ---: | --- | ---: |');
  for (const dim of review.dimensions) {
    const label = DIMENSION_LABELS[dim.dimension] ?? dim.dimension;
    lines.push(`| ${label} | ${dim.score} | ${dim.highestEvidence} | ${dim.ceiling} |`);
  }
  lines.push('');

  // Per-check detail.
  for (const dim of review.dimensions) {
    const label = DIMENSION_LABELS[dim.dimension] ?? dim.dimension;
    lines.push(`### ${label}`);
    lines.push('');
    for (const check of dim.checks) {
      lines.push(`- **${check.checkId}** — \`${check.state}\`: ${check.summary}`);
    }
    lines.push('');
  }

  if (review.findings.length > 0) {
    lines.push('## Findings');
    lines.push('');
    for (const f of review.findings) {
      const progress = f.repairProgress ? ` _(repair: ${f.repairProgress})_` : '';
      lines.push(`### [${f.severity.toUpperCase()}] ${f.id} — ${f.primaryCheck}${progress}`);
      lines.push(`- **Problem:** ${f.problem}`);
      lines.push(`- **Impact:** ${f.impact}`);
      lines.push(`- **Repair:** ${f.repair}`);
      lines.push(`- **Validation:** ${f.validationRoute}`);
      lines.push('');
    }
  } else {
    lines.push('## Findings');
    lines.push('');
    lines.push('_No repairable findings for this episode._');
    lines.push('');
  }

  return lines.join('\n');
}
