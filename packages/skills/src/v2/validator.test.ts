import { describe, it, expect } from 'vitest';
import {
  validateSkillV2,
  parseAllowedTools,
  validateSkillFolder,
  applyV2Fields,
} from './validator.js';
import { importSkillV2 } from './importer.js';

const VALID_MD = `---
name: fix-typos
description: Use this skill whenever you need to fix typos in text. Triggers include "typo", "spelling".
allowed-tools: file terminal
sandbox_permissions: default
license: MIT
metadata:
  version: "1.2.0"
sources:
  - name: typo-helper
    url: https://example.com/typo-helper
---

# Fix Typos

Fix all typos in the provided text.
`;

describe('validateSkillV2', () => {
  it('accepts a well-formed v2 manifest', () => {
    const res = validateSkillV2({
      name: 'fix-typos',
      description: 'Use this skill whenever you need to fix typos.',
      'allowed-tools': 'file terminal',
      sandbox_permissions: 'default',
      license: 'MIT',
      metadata: { version: '1.2.0', internal: false },
      sources: [{ name: 'typo-helper' }],
    });
    expect(res.ok).toBe(true);
    expect(res.issues).toHaveLength(0);
  });

  it('rejects unknown tools and bad sandbox levels', () => {
    const res = validateSkillV2({
      name: 'bad',
      description: 'd',
      'allowed-tools': 'file rm-rf',
      sandbox_permissions: 'root',
    });
    expect(res.ok).toBe(false);
    expect(res.issues.map((i) => i.path)).toContain('allowed-tools');
    expect(res.issues.map((i) => i.path)).toContain('sandbox_permissions');
  });

  it('warns on non-lowercase names and missing description', () => {
    const res = validateSkillV2({ name: 'Bad_Name' });
    expect(res.issues.some((i) => i.path === 'description')).toBe(true);
  });
});

describe('parseAllowedTools', () => {
  it('splits and lowercases', () => {
    expect(parseAllowedTools('Read Write Edit Bash')).toEqual(['read', 'write', 'edit', 'bash']);
  });
});

describe('validateSkillFolder', () => {
  it('requires tests when scripts exist', () => {
    expect(validateSkillFolder({ hasScripts: true, hasTests: false }).ok).toBe(false);
    expect(validateSkillFolder({ hasScripts: true, hasTests: true }).ok).toBe(true);
    expect(validateSkillFolder({ hasScripts: false, hasTests: false }).ok).toBe(true);
  });
});

describe('importSkillV2', () => {
  it('imports a valid v2 document with all fields mapped', () => {
    const result = importSkillV2({
      content: VALID_MD,
      id: 'fix-typos',
      category: 'developer',
      hasScripts: true,
      hasTests: true,
    });
    expect(result.skill).toBeDefined();
    expect(result.skipped).toHaveLength(0);
    expect(result.skill?.allowedTools).toEqual(['file', 'terminal']);
    expect(result.skill?.sandboxPermissions).toBe('default');
    expect(result.skill?.license).toBe('MIT');
    expect(result.skill?.metadata?.version).toBe('1.2.0');
    expect(result.skill?.sources?.[0]?.name).toBe('typo-helper');
  });

  it('skips documents that violate the contract', () => {
    const result = importSkillV2({
      content: `---\nname: Broken Skill\nallowed-tools: file\n---\nbody`,
      id: 'broken',
      category: 'developer',
      hasScripts: true,
      hasTests: false,
    });
    expect(result.skill).toBeUndefined();
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.skipped.join(' ')).toContain('scripts/');
  });
});

describe('applyV2Fields', () => {
  it('applies manifest fields onto a base skill', () => {
    const base = {
      id: 'x',
      name: 'x',
      description: 'd',
      category: 'developer',
      version: '1.0.0',
      scopes: [],
      status: 'ready',
      run: async () => ({ success: true }),
    };
    const out = applyV2Fields(base, {
      name: 'x',
      description: 'd',
      'allowed-tools': 'file',
      license: 'MIT',
      metadata: { internal: true },
    });
    expect(out.allowedTools).toEqual(['file']);
    expect(out.metadata?.internal).toBe(true);
  });
});
