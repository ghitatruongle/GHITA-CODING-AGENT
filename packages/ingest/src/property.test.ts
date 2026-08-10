import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  splitFixed,
  splitMarkdown,
  splitCode,
  splitRecursive,
  chunkDocument,
} from './splitters.js';

// ==============================================================================
// v1.1.0 Track 11 F5 — property tests cho splitters (fast-check)
// ==============================================================================

describe('splitFixed property tests', () => {
  it('never throws, returns strings within chunk size, non-empty when input non-empty', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 5000 }),
        fc.integer({ min: 10, max: 500 }),
        (input, chunkSize) => {
          const parts = splitFixed(input, { chunkSize, overlap: 0 });
          if (input.trim().length === 0) {
            return parts.length === 0;
          }
          return parts.length >= 1 && parts.every((p) => p.length <= chunkSize);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('re-joining parts (minus overlap) preserves the original characters in order', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2000 }), (input) => {
        // splitFixed drops whitespace-only chunks by design (filter trim), so
        // preserve-chars only applies when the input has non-space content.
        if (input.trim().length === 0) return true;
        const parts = splitFixed(input, { chunkSize: 64, overlap: 8 });
        const joined = parts.join('');
        // Overlap duplicates a few chars — every char of input must appear in order.
        let i = 0;
        for (const ch of joined) {
          if (ch === input[i]) i++;
          if (i >= input.length) break;
        }
        return i >= input.length;
      }),
      { numRuns: 200 },
    );
  });
});

describe('splitMarkdown / splitCode / splitRecursive property tests', () => {
  it('never throw on arbitrary unicode strings', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 4000 }),
        fc.constantFrom(
          'a',
          '# H',
          '# 标题\n\n正文',
          '```js\ncode\n```',
          `🚀 emoji ${'中'.repeat(20)}`,
        ),
        (input) => {
          const parts = splitMarkdown(input);
          expectNoThrow(() => splitMarkdown(input));
          expectNoThrow(() => splitCode(input, { chunkSize: 100 }));
          expectNoThrow(() => splitRecursive(input));
          return parts.every((p) => typeof p === 'string');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('chunkDocument never throws and ids are unique', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 3000 }), (content) => {
        const chunks = chunkDocument(
          { path: 'p.md', source: 'markdown', content, hash: 'h', bytes: content.length },
          { chunkSize: 100 },
        );
        const ids = new Set(chunks.map((c) => c.id));
        return ids.size === chunks.length;
      }),
      { numRuns: 200 },
    );
  });
});

function expectNoThrow(fn: () => void): void {
  fn();
}
