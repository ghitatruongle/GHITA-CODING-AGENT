// Track 5 P5.3 — redactSpanned helper (exact-span redaction for scanner output).
import { describe, expect, it } from 'vitest';
import { redactSpanned } from '../src/scanner/engine.js';

describe('redactSpanned', () => {
  it('replaces exact spans and leaves the rest untouched', () => {
    const content = 'key=AKIAIOSFODNN7EXAMPLE and ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    const redacted = redactSpanned(content, [
      { start: 4, end: 24 },
      { start: 29, end: 69 },
    ]);
    expect(redacted).toBe('key=[REDACTED] and [REDACTED]');
  });

  it('applies later spans first so earlier offsets stay valid', () => {
    const content = 'AAAA BBBB';
    const redacted = redactSpanned(
      content,
      [
        { start: 0, end: 4 },
        { start: 5, end: 9 },
      ],
      'X',
    );
    expect(redacted).toBe('X X');
  });

  it('ignores out-of-range and inverted spans', () => {
    const content = 'safe';
    expect(redactSpanned(content, [{ start: -5, end: 2 }])).toBe('safe');
    expect(redactSpanned(content, [{ start: 2, end: 2 }])).toBe('safe');
    expect(redactSpanned(content, [{ start: 1, end: 99 }])).toBe('safe');
  });

  it('returns content unchanged for an empty span list', () => {
    expect(redactSpanned('hello', [])).toBe('hello');
  });
});
