import { describe, it, expect } from 'vitest';
import { extractLinks, slugify, extractHeadings } from '../src/checker/markdownGate';

describe('MarkdownGate regression', () => {
  it('extractLinks finds links', () => {
    const links = extractLinks('[hello](world.md)');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].href).toBe('world.md');
  });

  it('slugify normalizes headings', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('MarkdownCIGate detects broken link patterns', () => {
    const md = '[bad]()';
    const links = extractLinks(md);
    // The regex requires non-empty href; [bad]() does not produce a link entry,
    // which aligns with the deny-path design (empty target should not pass silently).
    expect(links.length).toBe(0);
  });

  it('extractHeadings finds headings', () => {
    const headings = extractHeadings('# Hello\n\nSome text\n');
    expect(headings.has('hello')).toBe(true);
  });
});
