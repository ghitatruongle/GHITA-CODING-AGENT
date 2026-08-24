// Validates the v2 SKILL.md frontmatter contract: `allowed-tools`,
// `sandbox_permissions`, `metadata.{version,internal}`, `license`, `sources`,
// plus folder-structure rules (scripts/ implies tests/).

import type { SkillDefinition } from '../types.js';

export const VALID_ALLOWED_TOOLS = ['file', 'terminal', 'screenshot', 'app'] as const;
export const VALID_SANDBOX_LEVELS = ['default', 'require_escalated'] as const;

export interface SkillV2Manifest {
  name?: string;
  description?: string;
  'allowed-tools'?: string;
  sandbox_permissions?: string;
  license?: string;
  version?: string;
  metadata?: {
    version?: string;
    internal?: boolean;
    [key: string]: unknown;
  };
  sources?: Array<{ name: string; url?: string }>;
  [key: string]: unknown;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface SkillV2Validation {
  ok: boolean;
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Parse plain frontmatter lines into a v2 manifest (subset of YAML). */
export function parseV2Manifest(frontmatter: Record<string, unknown>): SkillV2Manifest {
  const m: SkillV2Manifest = { ...frontmatter };
  if (typeof frontmatter.metadata === 'object' && frontmatter.metadata !== null) {
    m.metadata = frontmatter.metadata as SkillV2Manifest['metadata'];
  }
  if (Array.isArray(frontmatter.sources)) {
    m.sources = frontmatter.sources as SkillV2Manifest['sources'];
  }
  return m;
}

/** Validate a v2 manifest (frontmatter-level contract). */
export function validateSkillV2(manifest: SkillV2Manifest): SkillV2Validation {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!manifest.name || typeof manifest.name !== 'string') {
    issues.push({ path: 'name', message: 'name is required (lowercase-hyphen recommended)' });
  } else if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.name)) {
    warnings.push({ path: 'name', message: 'name should be lowercase with hyphens' });
  }
  if (!manifest.description || typeof manifest.description !== 'string') {
    issues.push({
      path: 'description',
      message: 'description is required ("what" + "when to use")',
    });
  }

  if (manifest['allowed-tools'] !== undefined) {
    const tools = parseAllowedTools(manifest['allowed-tools']);
    for (const t of tools) {
      if (!(VALID_ALLOWED_TOOLS as readonly string[]).includes(t)) {
        issues.push({ path: 'allowed-tools', message: `unknown tool "${t}"` });
      }
    }
  }

  if (
    manifest['sandbox_permissions'] !== undefined &&
    !(VALID_SANDBOX_LEVELS as readonly string[]).includes(manifest['sandbox_permissions'] as string)
  ) {
    issues.push({
      path: 'sandbox_permissions',
      message: `must be one of: ${VALID_SANDBOX_LEVELS.join(', ')}`,
    });
  }

  if (manifest.license !== undefined && typeof manifest.license !== 'string') {
    issues.push({ path: 'license', message: 'license must be a string (SPDX or "Proprietary")' });
  }

  if (manifest.metadata?.version !== undefined && typeof manifest.metadata.version !== 'string') {
    issues.push({ path: 'metadata.version', message: 'must be a quoted string' });
  }
  if (
    manifest.metadata?.internal !== undefined &&
    typeof manifest.metadata.internal !== 'boolean'
  ) {
    issues.push({ path: 'metadata.internal', message: 'must be a boolean' });
  }

  if (manifest.sources !== undefined && !Array.isArray(manifest.sources)) {
    issues.push({ path: 'sources', message: 'sources must be an array of {name, url?}' });
  }

  return { ok: issues.length === 0, issues, warnings };
}

/** Parse "allowed-tools: Read Write Edit Bash" style lists (space separated). */
export function parseAllowedTools(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

/**
 * Folder-structure contract (P26): a skill that ships `scripts/` must also
 * ship a test suite under `tests/<skill>/` — enforced at import time.
 */
export function validateSkillFolder({
  hasScripts,
  hasTests,
  files,
}: {
  hasScripts: boolean;
  hasTests: boolean;
  files?: readonly string[];
}): SkillV2Validation {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (hasScripts && !hasTests) {
    issues.push({
      path: 'scripts/',
      message: 'skill ships scripts/ but no tests/<skill>/ suite (structural contract)',
    });
  }
  if (files) {
    for (const f of files) {
      if (f.includes('..') || f.startsWith('/') || /^[A-Za-z]:/.test(f)) {
        warnings.push({ path: f, message: 'suspicious path component' });
      }
    }
  }
  return { ok: issues.length === 0, issues, warnings };
}

/** Map a validated v2 manifest onto a SkillDefinition skeleton (fields only). */
export function applyV2Fields(skill: SkillDefinition, manifest: SkillV2Manifest): SkillDefinition {
  const allowed = manifest['allowed-tools']
    ? parseAllowedTools(manifest['allowed-tools'])
    : undefined;
  return {
    ...skill,
    allowedTools: allowed,
    sandboxPermissions: manifest['sandbox_permissions'] as SkillDefinition['sandboxPermissions'],
    license: typeof manifest.license === 'string' ? manifest.license : undefined,
    sources: manifest.sources,
    metadata: manifest.metadata,
  };
}
