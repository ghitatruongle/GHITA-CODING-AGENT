// ==============================================================================
// v0.4.9 A4: InstinctRegistry Unit Tests
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { InstinctRegistry, BUILTIN_INSTINCTS } from '../src/instincts/index.js';
import type { Instinct } from '../src/instincts/index.js';

describe('InstinctRegistry', () => {
  it('fires the test instinct on a source-file refactor task', () => {
    const reg = new InstinctRegistry();
    const fired = reg.evaluate({ activeFile: 'src/login.ts', taskType: 'refactor' });
    const ids = fired.map((f) => f.instinct.id);
    expect(ids).toContain('instinct-run-tests-on-src-change');
    expect(reg.suggestedSkills(fired)).toContain('test.run');
  });

  it('fires the security scan instinct on a secret-like error', () => {
    const reg = new InstinctRegistry();
    const fired = reg.evaluate({ errorText: 'Error: invalid token when calling API key endpoint' });
    expect(fired.some((f) => f.instinct.suggestedSkillId === 'security.scan')).toBe(true);
  });

  it('resolves conflicts: diagnose supersedes run-tests on a stack trace', () => {
    const reg = new InstinctRegistry();
    const fired = reg.evaluate({
      activeFile: 'src/a.ts',
      taskType: 'fix',
      errorText: 'TypeError: x is undefined\n    at foo (src/a.ts:12:5)',
    });
    const ids = fired.map((f) => f.instinct.id);
    // diagnose fires and suppresses the run-tests instinct via conflictsWith
    expect(ids).toContain('instinct-diagnose-on-stacktrace');
    expect(ids).not.toContain('instinct-run-tests-on-src-change');
  });

  it('sorts fired instincts by priority descending', () => {
    const reg = new InstinctRegistry();
    const fired = reg.evaluate({
      activeFile: 'src/auth.ts',
      taskType: 'feature',
      errorText: 'secret leaked',
      prompt: 'fix credential leak',
    });
    const priorities = fired.map((f) => f.instinct.priority);
    const sorted = [...priorities].sort((a, b) => b - a);
    expect(priorities).toEqual(sorted);
  });

  it('reports match reasons', () => {
    const reg = new InstinctRegistry();
    const fired = reg.evaluate({ activeFile: 'x.tsx', taskType: 'feature' });
    const hit = fired.find((f) => f.instinct.id === 'instinct-run-tests-on-src-change');
    expect(hit?.reasons.some((r) => r.includes('.tsx'))).toBe(true);
  });

  it('does not fire disabled instincts', () => {
    const reg = new InstinctRegistry([
      { ...BUILTIN_INSTINCTS[0]!, enabled: false },
    ]);
    expect(reg.evaluate({ activeFile: 'a.ts', taskType: 'refactor' })).toHaveLength(0);
  });

  it('supports register/unregister/list', () => {
    const reg = new InstinctRegistry([]);
    const custom: Instinct = {
      id: 'custom',
      name: 'Custom',
      description: 'test',
      triggers: { keywords: ['deploy'] },
      suggestedSkillId: 'deploy.run',
      priority: 1,
      enabled: true,
    };
    reg.register(custom);
    expect(reg.list()).toHaveLength(1);
    expect(reg.evaluate({ prompt: 'please deploy now' })).toHaveLength(1);
    expect(reg.unregister('custom')).toBe(true);
    expect(reg.list()).toHaveLength(0);
  });

  it('tolerates invalid regex error patterns without throwing', () => {
    const reg = new InstinctRegistry([
      {
        id: 'bad-regex',
        name: 'bad',
        description: 'test',
        triggers: { errorPatterns: ['(unclosed'] },
        suggestedSkillId: 'x',
        priority: 1,
        enabled: true,
      },
    ]);
    // Falls back to substring match; '(unclosed' won't match, so no throw + no fire
    expect(() => reg.evaluate({ errorText: 'some error' })).not.toThrow();
  });
});
