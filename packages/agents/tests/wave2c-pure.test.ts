// ==============================================================================
// Wave 2c — pure helpers: markdown gate + ast lock
// ==============================================================================

import { describe, it, expect } from 'vitest';
import {
  extractLinks,
  extractHeadings,
  slugify,
  mergeIssues,
} from '../src/checker/markdownGate.js';
import { buildHierarchy, computeSemanticHash } from '../src/checker/astLock.js';

describe('markdownGate pure helpers', () => {
  it('slugify normalizes headings', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Foo_Bar  ')).toBe('foobar');
  });

  it('extractLinks finds markdown links and images', () => {
    const md = 'See [docs](./a.md) and ![img](./x.png "t")';
    const links = extractLinks(md);
    expect(links.some((l) => l.href === './a.md')).toBe(true);
    expect(links.some((l) => l.href === './x.png')).toBe(true);
    expect(links[0]?.line).toBe(1);
  });

  it('extractHeadings ignores fenced code', () => {
    const md = ['# Title', '```', '# not-a-heading', '```', '## Section'].join('\n');
    const map = extractHeadings(md);
    expect(map.has('title')).toBe(true);
    expect(map.has('section')).toBe(true);
    expect(map.has('not-a-heading')).toBe(false);
  });

  it('mergeIssues flattens lists', () => {
    const merged = mergeIssues(
      [{ severity: 'error', filePath: 'a.md', line: 1, column: 1, rule: 'r', message: 'm' }],
      [{ severity: 'warning', filePath: 'b.md', line: 2, column: 1, rule: 'r2', message: 'm2' }],
    );
    expect(merged).toHaveLength(2);
  });
});

describe('astLock pure helpers', () => {
  it('computeSemanticHash ignores whitespace', () => {
    const a = computeSemanticHash('function  foo() {\n  return 1\n}');
    const b = computeSemanticHash('function foo(){return 1}');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('buildHierarchy nests methods under classes by line range', () => {
    const tags = [
      {
        name: 'Foo',
        kind: 'definition' as const,
        startLine: 1,
        endLine: 20,
        filePath: 'a.ts',
      },
      {
        name: 'bar',
        kind: 'definition' as const,
        startLine: 5,
        endLine: 10,
        filePath: 'a.ts',
      },
      {
        name: 'use',
        kind: 'reference' as const,
        startLine: 6,
        endLine: 6,
        filePath: 'a.ts',
      },
    ];
    const hierarchy = buildHierarchy(tags as never);
    const foo = hierarchy.find((h) => h.name === 'Foo');
    const bar = hierarchy.find((h) => h.name === 'bar');
    expect(foo).toBeTruthy();
    expect(bar?.parentName).toBe('Foo');
    expect(foo?.children.some((c) => c.name === 'bar')).toBe(true);
  });
});
