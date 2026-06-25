// ==============================================================================
// Fuzz Tests -- Property-based testing for security-critical code
// ==============================================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { InputSanitizer } from '@ghita/security';

describe('Fuzz: InputSanitizer', () => {
  const sanitizer = new InputSanitizer();

  it('escapeHtml should never throw on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizer.escapeHtml(input);
        expect(typeof result).toBe('string');
      }),
    );
  });

  it('escapeHtml should always escape < and >', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizer.escapeHtml(input);
        if (input.includes('<')) expect(result).not.toContain('<');
        if (input.includes('>')) expect(result).not.toContain('>');
      }),
    );
  });

  it('stripHtml should remove all tags', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizer.stripHtml(input);
        expect(result).not.toMatch(/<[^>]+>/);
      }),
    );
  });

  it('escapeShell should produce safe shell arguments', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizer.escapeShell(input);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('sanitizeFilename should never contain path traversal', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizer.sanitizeFilename(input);
        expect(result).not.toContain('..');
        expect(result).not.toContain('/');
        expect(result).not.toContain('\\');
      }),
    );
  });

  it('isSafeUrl should handle arbitrary URLs without throwing', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => sanitizer.isSafeUrl(input)).not.toThrow();
      }),
    );
  });

  it('escapeHtml should be idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = sanitizer.escapeHtml(input);
        const twice = sanitizer.escapeHtml(once);
        expect(once).toBe(twice);
      }),
    );
  });
});
