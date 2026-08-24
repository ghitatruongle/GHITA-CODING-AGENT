import type { EvalRun, RunOutcome } from './types.js';

const DIM_LABEL: Record<string, string> = {
  'task-understanding': 'Task Understanding',
  'controlled-execution': 'Controlled Execution',
  'change-validation': 'Change Validation',
  'reliable-delivery': 'Reliable Delivery',
  'learning-capture': 'Learning Capture',
};

export interface Bundle {
  markdown: string;
  json: string;
}

/** Render a scored run into a standalone Markdown evidence report. */
export function renderRunReport(run: EvalRun): string {
  const lines: string[] = [];
  lines.push(`# Eval Report — ${run.task.title} (${run.runId})`);
  lines.push('');
  lines.push(`- **Suite:** ${run.suite} · **Task:** ${run.task.id}`);
  lines.push(
    `- **Result:** ${run.status === 'passed' ? '✅ passed' : '❌ failed'} · **Score:** ${run.score}/100`,
  );
  lines.push(`- **Duration:** ${run.durationMs} ms · **Version:** ${run.version}`);
  lines.push('');
  lines.push('## Evidence');
  lines.push('');
  lines.push('| Dimension | Level | Label |');
  lines.push('|---|---|---|');
  for (const e of run.evidence) {
    lines.push(`| ${DIM_LABEL[e.dimension] ?? e.dimension} | ${e.level} | ${e.label} |`);
  }
  lines.push('');
  if (run.passReasons.length > 0) {
    lines.push('## Pass reasons');
    lines.push('');
    for (const r of run.passReasons) lines.push(`- ${r}`);
    lines.push('');
  }
  if (run.failReasons.length > 0) {
    lines.push('## Fail reasons');
    lines.push('');
    for (const r of run.failReasons) lines.push(`- ${r}`);
    lines.push('');
  }
  lines.push('## Trajectory');
  lines.push('');
  if (run.steps.length === 0) lines.push('_No tool steps captured._');
  for (const s of run.steps.slice(-20)) {
    const args = s.args ? ` ${JSON.stringify(s.args)}` : '';
    lines.push(`- \`${s.tool}\`${args.length > 160 ? `${args.slice(0, 160)}…` : args}`);
  }
  return lines.join('\n');
}

/** Render a compare summary between a baseline and a candidate run set. */
export function renderCompareReport(
  baseline: RunOutcome,
  candidate: RunOutcome,
  scope: { suite: string; baselineVersion: string; candidateVersion: string },
): string {
  const delta = candidate.score - baseline.score;
  const lines: string[] = [];
  lines.push(`# Eval Compare — ${scope.suite}`);
  lines.push('');
  lines.push(
    `**${scope.baselineVersion}** score ${baseline.score}/100 → **${scope.candidateVersion}** score ${candidate.score}/100 (Δ ${delta > 0 ? '+' : ''}${delta})`,
  );
  lines.push('');
  if (delta < 0) {
    lines.push('> ⚠️ Regression detected: candidate score dropped below baseline.');
  } else {
    lines.push('> No regression (candidate equal or better than baseline).');
  }
  return lines.join('\n');
}
