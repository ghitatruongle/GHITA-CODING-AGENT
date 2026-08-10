// ==============================================================================
// GHITA CODING AGENT - Skills v1.1.0 Track 2: v2 universal importer (P26)
// ==============================================================================
// Imports SKILL.md v2 documents: parses frontmatter (dedicated v2 YAML-subset
// parser with nested `metadata:` and `sources:` blocks), validates the v2
// contract, maps fields onto a SkillDefinition and reports per-skill skips.
// ==============================================================================

import type { SkillResult } from '@ghita/shared';
import type { SkillDefinition, SkillInvocation, SkillExecutionContext } from '../types.js';
import {
  applyV2Fields,
  parseV2Manifest,
  validateSkillFolder,
  validateSkillV2,
  type SkillV2Manifest,
} from './validator.js';

export interface V2ImportSource {
  /** Full SKILL.md content. */
  content: string;
  /** Skill id to register under. */
  id: string;
  /** Category for the skill. */
  category: string;
  /** Folder structure signal (structural contract). */
  hasScripts?: boolean;
  hasTests?: boolean;
  files?: string[];
}

export interface V2ImportResult {
  /** Imported skill, or undefined when validation failed. */
  skill?: SkillDefinition;
  /** Human-readable summary of what was skipped and why. */
  skipped: string[];
  /** Parsed frontmatter after v2 mapping. */
  manifest: SkillV2Manifest;
}

type V2Executor = (
  invocation: SkillInvocation,
  context: SkillExecutionContext,
  body: string,
) => Promise<SkillResult>;

/**
 * Dedicated v2 frontmatter parser: top-level scalars plus nested `metadata:`
 * (indented `key: value`) and `sources:` (`- name: …` / `url: …`) blocks.
 */
export function parseV2Frontmatter(content: string): {
  frontmatter: SkillV2Manifest;
  body: string;
} {
  const trimmed = content.trim();
  const frontmatter: SkillV2Manifest = {};
  let body = content;

  if (!trimmed.startsWith('---')) return { frontmatter, body };
  const endMatchIndex = trimmed.indexOf('\n---', 3);
  if (endMatchIndex === -1) return { frontmatter, body };

  const frontmatterStr = trimmed.slice(3, endMatchIndex);
  body = trimmed.slice(endMatchIndex + 4).trim();

  let section: 'top' | 'metadata' | 'sources' = 'top';
  let currentSource: { name: string; url?: string } | null = null;

  for (const rawLine of frontmatterStr.split('\n')) {
    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const line = rawLine.trim();
    if (!line) continue;

    // List item inside sources section.
    if (line.startsWith('- ')) {
      if (section !== 'sources') section = 'sources';
      const itemText = line.slice(2);
      const itemColon = itemText.indexOf(':');
      if (itemColon !== -1) {
        const itemKey = itemText.slice(0, itemColon).trim();
        const itemValue = stripQuotes(itemText.slice(itemColon + 1).trim());
        currentSource = itemKey === 'url' ? { name: '', url: itemValue } : { name: itemValue };
      } else {
        currentSource = { name: itemText };
      }
      const list = (frontmatter.sources ??= []);
      list.push(currentSource);
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();
    value = parseScalar(value);

    if (indent === 0 && (key === 'metadata' || key === 'sources')) {
      section = key as 'metadata' | 'sources';
      if (key === 'metadata') frontmatter.metadata = {};
      if (key === 'sources') frontmatter.sources = [];
      continue;
    }

    if (section === 'metadata' && key !== 'metadata') {
      frontmatter.metadata ??= {};
      if (key === 'internal') {
        frontmatter.metadata.internal = value === true || value === 'true';
      } else {
        frontmatter.metadata[key] = value;
      }
      continue;
    }

    if (section === 'sources') {
      if (key === 'url' && currentSource) {
        currentSource.url = String(value);
      } else if (key === 'name') {
        const list = (frontmatter.sources ??= []);
        currentSource = { name: String(value) };
        list.push(currentSource);
      }
      continue;
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

function parseScalar(raw: unknown): unknown {
  const text = String(raw);
  if (text === '') return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return stripQuotes(text);
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Import one SKILL.md v2 document into a SkillDefinition.
 * When no executor is provided, a placeholder reporting "no executor" is used.
 */
export function importSkillV2(source: V2ImportSource, executor?: V2Executor): V2ImportResult {
  const { frontmatter, body } = parseV2Frontmatter(source.content);
  const manifest = parseV2Manifest(frontmatter);
  const validation = validateSkillV2(manifest);
  const folder = validateSkillFolder({
    hasScripts: source.hasScripts ?? false,
    hasTests: source.hasTests ?? false,
    files: source.files,
  });

  const skipped: string[] = [];
  for (const issue of [...validation.issues, ...folder.issues]) {
    skipped.push(`${issue.path}: ${issue.message}`);
  }
  if (skipped.length > 0) {
    return { skill: undefined, skipped, manifest };
  }

  const run: SkillDefinition['run'] = executor
    ? async (invocation, context) => executor(invocation, context, body)
    : async (_invocation: SkillInvocation, _context: SkillExecutionContext) => ({
        success: false,
        error: 'skill imported without executor',
      });

  const base: SkillDefinition = {
    id: source.id,
    name: manifest.name ?? source.id,
    description: manifest.description ?? '',
    category: source.category as SkillDefinition['category'],
    version: String(manifest.metadata?.version ?? manifest.version ?? '1.0.0'),
    scopes: [],
    status: 'ready',
    enabled: true,
    run,
  };

  return { skill: applyV2Fields(base, manifest), skipped, manifest };
}

/** Import many v2 documents; returns the imported ones plus per-doc skip lists. */
export function importSkillV2Batch(
  sources: V2ImportSource[],
  executor?: V2Executor,
): { skills: SkillDefinition[]; skipped: Array<{ id: string; reasons: string[] }> } {
  const skills: SkillDefinition[] = [];
  const skipped: Array<{ id: string; reasons: string[] }> = [];
  for (const source of sources) {
    const result = importSkillV2(source, executor);
    if (result.skill) {
      skills.push(result.skill);
    } else {
      skipped.push({ id: source.id, reasons: result.skipped });
    }
  }
  return { skills, skipped };
}
