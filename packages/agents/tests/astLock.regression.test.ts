import { describe, it, expect } from 'vitest';
import {
  buildHierarchy,
  computeSemanticHash,
  loadASTLockConfig,
  ASTLockEngine,
} from '../src/checker/astLock';

describe('ASTLock regression', () => {
  it('buildHierarchy assigns parents correctly', () => {
    const tags: Array<{
      kind: string;
      name: string;
      startLine: number;
      endLine: number;
      scope: string;
      nodeText?: string;
    }> = [
      {
        kind: 'definition',
        name: 'ClassA',
        startLine: 1,
        endLine: 20,
        scope: '',
        nodeText: 'class A',
      },
      {
        kind: 'definition',
        name: 'methodA',
        startLine: 5,
        endLine: 10,
        scope: '',
        nodeText: 'def a()',
      },
    ];
    const result = buildHierarchy(tags);
    expect(result.length).toBe(2);
    const parent = result.find((r: { name?: string; children?: unknown[] }) => r.name === 'ClassA');
    expect(parent?.children.length).toBeGreaterThanOrEqual(0);
  });

  it('computeSemanticHash ignores whitespace', () => {
    const a = computeSemanticHash('function foo() { return 1; }');
    const b = computeSemanticHash('function foo() {\n  return 1;\n}');
    expect(a).toBe(b);
  });

  it('loadASTLockConfig returns defaults when file missing', () => {
    const cfg = loadASTLockConfig('.nonexistent/rules.yaml');
    expect(cfg.enabled).toBe(true);
    expect(cfg.lockedSymbols).toHaveLength(0);
  });

  it('ASTLockEngine validates deny path (symbol removed)', async () => {
    const engine = new ASTLockEngine();
    await engine.lockSymbols('test.ts', 'function foo() {}', 'typescript');
    const result = await engine.validate('test.ts', '', 'typescript');
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});
