// Wave 2 — skill-guard pure hash / trust helpers

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeContentHash,
  computeFileHash,
  computeSkillHash,
  DEFAULT_TRUSTED_REPOS,
} from '../src/hub/skill-guard.js';

describe('SkillGuard hashing', () => {
  it('computeContentHash is stable SHA-256 hex', () => {
    const h = computeContentHash('hello');
    expect(h).toHaveLength(64);
    expect(computeContentHash('hello')).toBe(h);
    expect(computeContentHash('hello!')).not.toBe(h);
  });

  it('computeFileHash reads file contents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-guard-'));
    const file = join(dir, 'a.js');
    writeFileSync(file, 'export const x = 1\n', 'utf8');
    expect(computeFileHash(file)).toBe(computeContentHash('export const x = 1\n'));
    rmSync(dir, { recursive: true, force: true });
  });

  it('computeSkillHash changes when content files change', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-guard-'));
    const script = join(dir, 'index.js');
    writeFileSync(script, 'console.log(1)\n', 'utf8');
    const meta = {
      id: 'demo',
      name: 'Demo',
      description: 'd',
      category: 'util',
      version: '1.0.0',
      source: 'local',
      tags: ['a'],
      permissions: [],
      dependencies: [],
    } as never;

    const h1 = computeSkillHash(meta, [script]);
    writeFileSync(script, 'console.log(2)\n', 'utf8');
    const h2 = computeSkillHash(meta, [script]);
    expect(h1).not.toBe(h2);

    // metadata-only path still returns a hash
    const hMeta = computeSkillHash(meta);
    expect(hMeta).toHaveLength(64);

    rmSync(dir, { recursive: true, force: true });
  });

  it('exposes default trusted repos', () => {
    expect(DEFAULT_TRUSTED_REPOS.length).toBeGreaterThan(0);
    expect(DEFAULT_TRUSTED_REPOS.some((r) => r.includes('ghita'))).toBe(true);
  });
});
