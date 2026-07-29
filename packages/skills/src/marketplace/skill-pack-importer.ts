// ==============================================================================
// v0.4.9 A10: Skill Pack Importer
//
// Imports a *pack* (collection) of external SKILL.md skills at once, validating
// each entry's license for MIT compatibility before conversion. Builds on the
// existing universal importer. Ships a curated "Community Essentials" pack.
//
// Only skills under MIT-compatible licenses are imported; others are reported
// as skipped so licensing stays clean.
// ==============================================================================

import type { SkillDefinition } from '../types.js';
import { importFromSkillMd } from '../importers/universal-importer.js';

/** Licenses considered compatible with the project's MIT license. */
export const MIT_COMPATIBLE_LICENSES = new Set([
  'MIT',
  'MIT-0',
  'APACHE-2.0',
  'APACHE 2.0',
  'BSD-2-CLAUSE',
  'BSD-3-CLAUSE',
  'ISC',
  'CC0-1.0',
  'CC0',
  'UNLICENSE',
  'MPL-2.0',
  '0BSD',
]);

/** One raw skill entry inside a pack (a SKILL.md plus metadata). */
export interface RawSkillEntry {
  /** Stable id/slug for the skill. */
  id: string;
  /** Raw SKILL.md content (frontmatter + body). */
  content: string;
  /** SPDX-ish license identifier for this skill/source. */
  license?: string;
}

/** A raw skill pack to import. */
export interface RawSkillPack {
  name: string;
  description?: string;
  /** Pack-level license (used when an entry omits its own). */
  license?: string;
  entries: RawSkillEntry[];
}

/** A skill skipped during import, with a reason. */
export interface SkippedSkill {
  id: string;
  reason: 'incompatible-license' | 'parse-error' | 'duplicate-id';
  detail: string;
}

/** The result of importing a pack. */
export interface SkillPackImportResult {
  packName: string;
  imported: SkillDefinition[];
  skipped: SkippedSkill[];
}

/** Normalize a license string for allowlist comparison. */
function normalizeLicense(license: string | undefined): string | undefined {
  return license?.trim().toUpperCase() || undefined;
}

/**
 * SkillPackImporter — validate + convert a collection of SKILL.md skills.
 *
 * Sử dụng:
 *   const importer = new SkillPackImporter();
 *   const result = importer.importPack(COMMUNITY_ESSENTIALS);
 *   registry.registerAll(result.imported);
 */
export class SkillPackImporter {
  /**
   * Import a pack. Each entry is license-checked, then converted via the
   * universal SKILL.md importer. Incompatible or unparseable entries are
   * reported in `skipped` rather than thrown.
   */
  importPack(pack: RawSkillPack): SkillPackImportResult {
    const imported: SkillDefinition[] = [];
    const skipped: SkippedSkill[] = [];
    const seen = new Set<string>();

    for (const entry of pack.entries) {
      const license = normalizeLicense(entry.license ?? pack.license);
      if (!license || !MIT_COMPATIBLE_LICENSES.has(license)) {
        skipped.push({
          id: entry.id,
          reason: 'incompatible-license',
          detail: `License "${entry.license ?? pack.license ?? '(none)'}" is not MIT-compatible.`,
        });
        continue;
      }
      if (seen.has(entry.id)) {
        skipped.push({
          id: entry.id,
          reason: 'duplicate-id',
          detail: 'Duplicate skill id in pack.',
        });
        continue;
      }
      try {
        const result = importFromSkillMd(entry.id, entry.content);
        imported.push(result.skill);
        seen.add(entry.id);
      } catch (error) {
        skipped.push({
          id: entry.id,
          reason: 'parse-error',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { packName: pack.name, imported, skipped };
  }
}

/** Build a minimal SKILL.md string. */
function skillMd(name: string, description: string, body: string, category = 'file'): string {
  return `---\nname: ${name}\ndescription: ${description}\ncategory: ${category}\nversion: 1.0.0\n---\n\n${body}`;
}

/**
 * Curated "Community Essentials" pack — MIT-licensed general-purpose skills
 * covering common agent tasks (docs, pdf, spreadsheet, commit, PR review).
 */
export const COMMUNITY_ESSENTIALS: RawSkillPack = {
  name: 'Community Essentials',
  description: 'A curated set of general-purpose agent skills (MIT-compatible).',
  license: 'MIT',
  entries: [
    {
      id: 'docs-writer',
      content: skillMd(
        'Docs Writer',
        'Draft and refine project documentation in Markdown.',
        'Produce clear, well-structured Markdown documentation for the given topic.',
      ),
    },
    {
      id: 'pdf-extract',
      content: skillMd(
        'PDF Extract',
        'Extract text and structure from a PDF document.',
        'Given a PDF path, extract its text content and outline.',
      ),
    },
    {
      id: 'xlsx-report',
      content: skillMd(
        'Spreadsheet Report',
        'Summarize tabular data and build a spreadsheet report.',
        'Given tabular data, compute summary statistics and produce a report.',
      ),
    },
    {
      id: 'commit-helper',
      content: skillMd(
        'Commit Helper',
        'Write a Conventional Commits message for staged changes.',
        'Inspect the staged diff and produce a Conventional Commits message.',
        'terminal',
      ),
    },
    {
      id: 'review-pr',
      content: skillMd(
        'PR Reviewer',
        'Review a pull request diff and surface high-signal issues.',
        'Given a diff, identify logic bugs, security issues, and missing tests.',
        'terminal',
      ),
    },
  ],
};
