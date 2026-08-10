import { describe, it, expect } from 'vitest';
import { createToolGate, runSkillWithToolGate } from './enforce.js';
import { classifyLicense, generateThirdPartyNotices, LICENSE_MATRIX } from './licenses.js';
import { InstinctTriggerMetrics } from './instinct-metrics.js';
import {
  computeFolderHash,
  parseSkillLockV3,
  upsertLockEntry,
  detectLockChanges,
} from './skill-lock.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SkillDefinition } from '../types.js';

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: 's1',
    name: 's1',
    description: 'd',
    category: 'developer',
    version: '1.0.0',
    scopes: [],
    status: 'ready',
    run: async () => ({ success: true }),
    ...overrides,
  };
}

describe('createToolGate', () => {
  it('denies adapters outside the allowlist', () => {
    const adapters = {
      file: { readFile: async () => 'x' },
      terminal: { runCommand: async () => ({ exitCode: 0, stdout: '', stderr: '', duration: 1 }) },
    };
    const { adapters: gated, stats } = createToolGate(adapters, ['file']);
    expect(gated.file).toBeDefined();
    expect(gated.terminal).toBeUndefined();
    const s = stats();
    expect(s.denied.map((d) => d.key)).toEqual(['terminal']);
    expect(s.allowed).toEqual(['file']);
  });

  it('keeps everything open when no allowlist declared', () => {
    const adapters = { file: { readFile: async () => 'x' } };
    const { adapters: gated, stats } = createToolGate(adapters, undefined);
    expect(gated.file).toBeDefined();
    expect(stats().denied).toHaveLength(0);
  });
});

describe('runSkillWithToolGate', () => {
  it('runs and reports denied tools for a restricted skill', async () => {
    const registry = { get: () => makeSkill({ allowedTools: ['file'] }) };
    const adapters = {
      terminal: { runCommand: async () => ({ exitCode: 0, stdout: '', stderr: '', duration: 0 }) },
    };
    const { denied } = await runSkillWithToolGate(registry, 's1', {}, adapters);
    expect(denied.some((d) => d.key === 'terminal')).toBe(true);
  });
});

describe('classifyLicense', () => {
  it('classifies permissive, copyleft and proprietary', () => {
    expect(classifyLicense('MIT').importable).toBe(true);
    expect(classifyLicense('Apache License 2.0').spdx).toBe('Apache-2.0');
    expect(classifyLicense('GPL-3.0').importable).toBe(false);
    expect(classifyLicense('Proprietary').class).toBe('proprietary');
    expect(classifyLicense(undefined).importable).toBe(false);
  });

  it('generates THIRD-PARTY_NOTICES', () => {
    const text = generateThirdPartyNotices([
      { name: 'skill-a', license: 'MIT', source: 'https://x' },
      { name: 'skill-b', license: 'Apache-2.0' },
    ]);
    expect(text).toContain('THIRD-PARTY NOTICES');
    expect(text).toContain('skill-a');
    expect(text).toContain('permissive');
  });
});

describe('InstinctTriggerMetrics', () => {
  it('tracks precision over time', () => {
    const m = new InstinctTriggerMetrics();
    m.record('a', true);
    m.record('a', true);
    m.record('a', false);
    expect(m.stats('a').precision).toBeCloseTo(2 / 3);
    expect(m.suggestion('a', 0.8)).toBeDefined();
    expect(m.suggestion('a', 0.1)).toBeUndefined();
  });
});

describe('skill-lock v3', () => {
  it('computes a stable folder hash and detects changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock3-'));
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), 'hello');
    writeFileSync(join(dir, 'scripts', 'run.sh'), '#!/bin/sh\n');

    const { hash, files } = computeFolderHash(dir);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(files).toBe(2);

    const lock = parseSkillLockV3(undefined);
    const { lock: updated, entry } = upsertLockEntry(lock, {
      id: 'x',
      ref: 'main',
      sourceType: 'github',
      provider: 'ghita',
      dir,
    });
    expect(entry.folderHash).toBe(hash);
    expect(detectLockChanges(updated, 'x', dir).stale).toBe(false);

    writeFileSync(join(dir, 'scripts', 'run.sh'), '#!/bin/sh\necho changed\n');
    expect(detectLockChanges(updated, 'x', dir).stale).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('LICENSE_MATRIX', () => {
  it('contains expected entries', () => {
    expect(Object.keys(LICENSE_MATRIX)).toContain('MIT-0');
    expect(LICENSE_MATRIX['MPL-2.0']?.importable).toBe(true);
  });
});
