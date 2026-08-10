// ==============================================================================
// GHITA CODING AGENT - Skills v1.1.0 Track 2: multi-harness export (P35)
// ==============================================================================
// Exports skills to standard SKILL.md layout for other harnesses:
// claude-code → .claude/skills/<name>/SKILL.md
// codex/cursor  → .agents/skills/<name>/SKILL.md
// vercel        → skills/<name>/SKILL.md (canonical)
// ghita         → skills/<name>/SKILL.md (canonical)
// ==============================================================================

import type { SkillDefinition } from '../types.js';

export type ExportHarness = 'claude-code' | 'codex' | 'cursor' | 'vercel' | 'ghita';

export interface HarnessTarget {
  harness: ExportHarness;
  /** Relative base directory for the harness. */
  baseDir: string;
}

export const HARNESS_TARGETS: Record<ExportHarness, HarnessTarget> = {
  'claude-code': { harness: 'claude-code', baseDir: '.claude/skills' },
  codex: { harness: 'codex', baseDir: '.agents/skills' },
  cursor: { harness: 'cursor', baseDir: '.agents/skills' },
  vercel: { harness: 'vercel', baseDir: 'skills' },
  ghita: { harness: 'ghita', baseDir: 'skills' },
};

export interface ExportedSkillFile {
  /** Relative path from the harness root, e.g. `.claude/skills/my-skill/SKILL.md`. */
  path: string;
  content: string;
}

export interface ExportPlan {
  harness: ExportHarness;
  files: ExportedSkillFile[];
  skipped: Array<{ id: string; reason: string }>;
}

/** Serialize a SkillDefinition back to v2 SKILL.md frontmatter. */
export function skillToMarkdown(skill: SkillDefinition): string {
  const frontmatter: string[] = ['---'];
  frontmatter.push(`name: ${skill.name}`);
  frontmatter.push(`description: "${escapeYaml(skill.description)}"`);
  if (skill.version) frontmatter.push(`version: "${skill.version}"`);
  if (skill.allowedTools && skill.allowedTools.length > 0) {
    frontmatter.push(`allowed-tools: ${skill.allowedTools.join(' ')}`);
  }
  if (skill.sandboxPermissions)
    frontmatter.push(`sandbox_permissions: ${skill.sandboxPermissions}`);
  if (skill.license) frontmatter.push(`license: ${skill.license}`);
  if (skill.metadata?.internal) frontmatter.push(`metadata:\n  internal: true`);
  if (skill.sources && skill.sources.length > 0) {
    frontmatter.push('sources:');
    for (const s of skill.sources) {
      frontmatter.push(`  - name: "${escapeYaml(s.name)}"${s.url ? `\n    url: "${s.url}"` : ''}`);
    }
  }
  frontmatter.push('---');
  frontmatter.push('');
  frontmatter.push(`# ${skill.name}`);
  frontmatter.push('');
  frontmatter.push(skill.description);
  return frontmatter.join('\n');
}

/** Build the export plan for one harness. */
export function planExport(
  skills: readonly SkillDefinition[],
  harness: ExportHarness,
  options: { includeInternal?: boolean } = {},
): ExportPlan {
  const target = HARNESS_TARGETS[harness];
  const files: ExportedSkillFile[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const skill of skills) {
    if (skill.metadata?.internal && !options.includeInternal) {
      skipped.push({ id: skill.id, reason: 'metadata.internal: hidden from discovery' });
      continue;
    }
    files.push({
      path: `${target.baseDir}/${skill.id}/SKILL.md`,
      content: skillToMarkdown(skill),
    });
  }
  return { harness, files, skipped };
}

export function exportPlanSummary(plan: ExportPlan): string {
  const lines: string[] = [];
  lines.push(`# Skill export — ${plan.harness} (${plan.files.length} skills)`);
  lines.push('');
  for (const f of plan.files) lines.push(`- ${f.path}`);
  if (plan.skipped.length > 0) {
    lines.push('');
    lines.push(`Skipped (${plan.skipped.length}):`);
    for (const s of plan.skipped) lines.push(`- ${s.id}: ${s.reason}`);
  }
  return lines.join('\n');
}

function escapeYaml(value: string): string {
  return value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
