// ==============================================================================
// GHITA CODING AGENT — Phase 10: Anti-Slop Extended Tests
// Bổ sung: Aho-Corasick unit tests, Code block detection, TokenSavingsTracker,
// Stream/Chat middleware, edge cases, unicode, adversarial scenarios
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AntiSlopFilter,
  cleanSlop,
  createAntiSlopStreamMiddleware,
  createAntiSlopMiddleware,
} from '../src/middleware/antiSlop.js';

// =============================================================================
// Aho-Corasick Algorithm Tests (via getAcMatcher)
// =============================================================================

describe('AhoCorasick (via AntiSlopFilter.getAcMatcher)', () => {
  it('should find single pattern in text', () => {
    const filter = new AntiSlopFilter({ customPatterns: ['foobar'], trackSavings: false });
    const ac = filter.getAcMatcher();
    const results = ac.search('hello foobar world');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.endPos === 11)).toBe(true);
  });

  it('should find multiple patterns in text', () => {
    const filter = new AntiSlopFilter({ customPatterns: ['alpha', 'beta'], trackSavings: false });
    const ac = filter.getAcMatcher();
    const results = ac.search('alpha and beta');
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('should find overlapping patterns', () => {
    const filter = new AntiSlopFilter({ customPatterns: ['abc', 'bc'], trackSavings: false });
    const ac = filter.getAcMatcher();
    const results = ac.search('abc');
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('should return empty for no matches', () => {
    const filter = new AntiSlopFilter({ customPatterns: ['xyz'], trackSavings: false });
    const ac = filter.getAcMatcher();
    const results = ac.search('hello world');
    expect(results.length).toBe(0);
  });

  it('should be case-insensitive', () => {
    const filter = new AntiSlopFilter({ customPatterns: ['HELLO'], trackSavings: false });
    const ac = filter.getAcMatcher();
    const results = ac.search('HeLLo World');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle empty text', () => {
    const filter = new AntiSlopFilter({ trackSavings: false });
    const ac = filter.getAcMatcher();
    const results = ac.search('');
    expect(results).toEqual([]);
  });

  it('should handle single character text', () => {
    const filter = new AntiSlopFilter({ customPatterns: ['a'], trackSavings: false });
    const ac = filter.getAcMatcher();
    const results = ac.search('a');
    expect(results.length).toBe(1);
  });

  it('should find pattern at start of text', () => {
    const filter = new AntiSlopFilter({ customPatterns: ['certainly'], trackSavings: false });
    const ac = filter.getAcMatcher();
    const results = ac.search('certainly yes');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].endPos).toBe(8);
  });

  it('should find pattern at end of text', () => {
    const filter = new AntiSlopFilter({ customPatterns: ['happy'], trackSavings: false });
    const ac = filter.getAcMatcher();
    const results = ac.search('I am happy');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle repeated occurrences of same pattern', () => {
    const filter = new AntiSlopFilter({ customPatterns: ['the'], trackSavings: false });
    const ac = filter.getAcMatcher();
    const results = ac.search('the cat and the dog');
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// Code Block Detection Edge Cases
// =============================================================================

describe('Code Block Detection', () => {
  let filter: AntiSlopFilter;

  beforeEach(() => {
    filter = new AntiSlopFilter({ trackSavings: false });
  });

  it('should not filter inside backtick code block', () => {
    const input = '```\nCertainly! Here is code.\n```';
    const result = filter.cleanWithCodeBlockAwareness(input);
    expect(result.cleaned).toContain('Certainly!');
  });

  it('should not filter inside tilde code block', () => {
    const input = '~~~\nSure! Here is code.\n~~~';
    const result = filter.cleanWithCodeBlockAwareness(input);
    expect(result.cleaned).toContain('Sure!');
  });

  it('should filter outside code block but not inside', () => {
    const input = 'Certainly! Here is explanation.\n```\nSure! code here\n```\nAbsolutely! Done.';
    filter.resetCodeBlockState();
    const result = filter.cleanWithCodeBlockAwareness(input);
    expect(result.cleaned).not.toMatch(/^Certainly!/m);
    expect(result.cleaned).toContain('Sure!');
    expect(result.cleaned).not.toMatch(/^Absolutely!/m);
  });

  it('should handle code block with language tag', () => {
    const input = '```typescript\nCertainly! const x = 1;\n```';
    filter.resetCodeBlockState();
    const result = filter.cleanWithCodeBlockAwareness(input);
    expect(result.cleaned).toContain('Certainly!');
  });

  it('should handle multiple code blocks', () => {
    const input = '```\nSure! block1\n```\nCertainly! text\n```\nSure! block2\n```';
    filter.resetCodeBlockState();
    const result = filter.cleanWithCodeBlockAwareness(input);
    expect(result.cleaned).toContain('Sure! block1');
    expect(result.cleaned).toContain('Sure! block2');
    expect(result.cleaned).not.toMatch(/^Certainly!/m);
  });

  it('should handle unclosed code block (rest of text is code)', () => {
    const input = '```\nCertainly! All remaining text is code.\nSure! More code.';
    filter.resetCodeBlockState();
    const result = filter.cleanWithCodeBlockAwareness(input);
    expect(result.cleaned).toContain('Certainly!');
    expect(result.cleaned).toContain('Sure!');
  });

  it('should handle nested fences with different counts', () => {
    const input = '````\n```nested```\n````\nCertainly! outside';
    filter.resetCodeBlockState();
    const result = filter.cleanWithCodeBlockAwareness(input);
    expect(result.cleaned).toContain('```nested```');
    expect(result.cleaned).not.toMatch(/^Certainly!/m);
  });

  it('should reset code block state correctly', () => {
    filter.cleanWithCodeBlockAwareness('```\nSure! code\n```');
    filter.resetCodeBlockState();
    const result = filter.cleanWithCodeBlockAwareness('Certainly! Fresh text.');
    expect(result.cleaned).not.toContain('Certainly!');
  });
});

// =============================================================================
// TokenSavingsTracker
// =============================================================================

describe('TokenSavingsTracker', () => {
  it('should track total savings', () => {
    const filter = new AntiSlopFilter({ trackSavings: true });
    const tracker = filter.getSavingsTracker();

    tracker.record(10, ['Certainly!'], 100);
    tracker.record(5, ['Sure!'], 50);

    expect(tracker.getTotalSaved()).toBe(15);
    expect(tracker.getLogs()).toHaveLength(2);
  });

  it('should compute summary correctly', () => {
    const filter = new AntiSlopFilter({ trackSavings: true });
    const tracker = filter.getSavingsTracker();

    tracker.record(10, ['Certainly!'], 100);
    tracker.record(20, ['Sure!', 'Happy to help'], 200);

    const summary = tracker.getSummary();
    expect(summary.totalSaved).toBe(30);
    expect(summary.passCount).toBe(2);
    expect(summary.avgSavedPerPass).toBe(15);
  });

  it('should return zero summary when no records', () => {
    const filter = new AntiSlopFilter({ trackSavings: true });
    const tracker = filter.getSavingsTracker();

    const summary = tracker.getSummary();
    expect(summary.totalSaved).toBe(0);
    expect(summary.passCount).toBe(0);
    expect(summary.avgSavedPerPass).toBe(0);
  });

  it('should store log entries with timestamps', () => {
    const filter = new AntiSlopFilter({ trackSavings: true });
    const tracker = filter.getSavingsTracker();

    tracker.record(5, ['Certainly!'], 100);
    const logs = tracker.getLogs();

    expect(logs[0].timestamp).toBeDefined();
    expect(new Date(logs[0].timestamp).getTime()).not.toBeNaN();
    expect(logs[0].tokensSaved).toBe(5);
    expect(logs[0].patternsMatched).toEqual(['Certainly!']);
    expect(logs[0].totalInputTokens).toBe(100);
  });

  it('close() should not throw when no db', () => {
    const filter = new AntiSlopFilter({ trackSavings: true });
    const tracker = filter.getSavingsTracker();
    expect(() => tracker.close()).not.toThrow();
  });
});

// =============================================================================
// AntiSlopFilter.cleanChunk — Advanced
// =============================================================================

describe('AntiSlopFilter.cleanChunk — advanced', () => {
  let filter: AntiSlopFilter;

  beforeEach(() => {
    filter = new AntiSlopFilter({ trackSavings: false });
  });

  it('should return unchanged for empty string', () => {
    const result = filter.cleanChunk('');
    expect(result.cleaned).toBe('');
    expect(result.charsRemoved).toBe(0);
    expect(result.matchedPatterns).toEqual([]);
  });

  it('should return unchanged for text shorter than minMatchLength', () => {
    const f = new AntiSlopFilter({ minMatchLength: 100, trackSavings: false });
    const result = f.cleanChunk('Certainly! code');
    expect(result.cleaned).toBe('Certainly! code');
    expect(result.charsRemoved).toBe(0);
  });

  it('should remove multiple slop phrases in sequence', () => {
    const result = filter.cleanChunk('Sure! I can help with that. Here is the code.');
    expect(result.matchedPatterns.length).toBeGreaterThanOrEqual(2);
    expect(result.cleaned).not.toMatch(/^(Sure|I can help)/i);
  });

  it('should not modify normal code output', () => {
    const code = 'function hello() {\n  return "world";\n}';
    const result = filter.cleanChunk(code);
    expect(result.cleaned).toBe(code);
    expect(result.charsRemoved).toBe(0);
  });

  it('should handle text with only slop (nothing after)', () => {
    const result = filter.cleanChunk('Certainly!');
    expect(result.charsRemoved).toBeGreaterThan(0);
  });

  it('should handle custom patterns', () => {
    const f = new AntiSlopFilter({ customPatterns: ['As an AI'], trackSavings: false });
    const result = f.cleanChunk('As an AI language model, I suggest...');
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
    expect(result.cleaned).not.toMatch(/^As an AI/i);
  });

  it('should handle mixed case slop', () => {
    const result = filter.cleanChunk('CERTAINLY! Here is the answer.');
    expect(result.cleaned).toMatch(/^Here is the answer/);
  });

  it('should handle slop with extra whitespace', () => {
    const result = filter.cleanChunk('Sure!   Here is code.');
    expect(result.cleaned).toMatch(/^Here is code/);
  });

  it('should preserve non-slop leading text', () => {
    const result = filter.cleanChunk('The answer is 42.');
    expect(result.cleaned).toBe('The answer is 42.');
    expect(result.charsRemoved).toBe(0);
  });

  it('should count characters removed accurately', () => {
    const result = filter.cleanChunk('Certainly! Here is code.');
    expect(result.charsRemoved).toBe('Certainly! '.length);
  });
});

// =============================================================================
// AntiSlopFilter.cleanWithCodeBlockAwareness — Advanced
// =============================================================================

describe('cleanWithCodeBlockAwareness — advanced', () => {
  let filter: AntiSlopFilter;

  beforeEach(() => {
    filter = new AntiSlopFilter({ trackSavings: false });
  });

  it('should handle multiline text with mixed content', () => {
    const input = 'Certainly! Explanation.\nNormal line.\nAnother line.';
    const result = filter.cleanWithCodeBlockAwareness(input);
    expect(result.cleaned).not.toMatch(/^Certainly!/m);
    expect(result.cleaned).toContain('Normal line.');
    expect(result.cleaned).toContain('Another line.');
  });

  it('should handle empty input', () => {
    const result = filter.cleanWithCodeBlockAwareness('');
    expect(result.cleaned).toBe('');
    expect(result.charsRemoved).toBe(0);
  });

  it('should handle single line', () => {
    const result = filter.cleanWithCodeBlockAwareness('Certainly! The answer.');
    expect(result.cleaned).not.toMatch(/^Certainly!/);
  });

  it('should handle Windows line endings (\\r\\n)', () => {
    const input = 'Certainly! Line1\r\nSure! Line2';
    const result = filter.cleanWithCodeBlockAwareness(input);
    expect(result.matchedPatterns.length).toBeGreaterThanOrEqual(1);
  });

  it('should track charsRemoved across multiple lines', () => {
    const input = 'Certainly! Line1\nSure! Line2';
    const result = filter.cleanWithCodeBlockAwareness(input);
    expect(result.charsRemoved).toBeGreaterThan(0);
  });
});

// =============================================================================
// createAntiSlopStreamMiddleware
// =============================================================================

describe('createAntiSlopStreamMiddleware', () => {
  it('should create a valid middleware function', () => {
    const mw = createAntiSlopStreamMiddleware();
    expect(typeof mw).toBe('function');
  });

  it('should pass through chunks without slop', async () => {
    const mw = createAntiSlopStreamMiddleware({ trackSavings: false });

    async function* mockStream() {
      yield { content: 'function hello() {\n', done: false };
      yield { content: '  return "world";\n', done: false };
      yield { content: '}\n', done: true };
    }

    const gen = await mw({ messages: [], provider: {} as any }, async () => mockStream());

    const chunks: any[] = [];
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    const allContent = chunks.map((c) => c.content).join('');
    expect(allContent).toContain('function hello()');
    expect(allContent).toContain('return "world"');
  });

  it('should strip slop from stream output', async () => {
    const mw = createAntiSlopStreamMiddleware({ trackSavings: false });

    async function* mockStream() {
      yield { content: 'Certainly! Here is the code:\n', done: false };
      yield { content: 'const x = 1;\n', done: true };
    }

    const gen = await mw({ messages: [], provider: {} as any }, async () => mockStream());

    const chunks: any[] = [];
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    const allContent = chunks.map((c) => c.content).join('');
    expect(allContent).not.toMatch(/^Certainly!/);
    expect(allContent).toContain('const x = 1;');
  });

  it('should handle empty stream', async () => {
    const mw = createAntiSlopStreamMiddleware({ trackSavings: false });

    async function* mockStream() {
      // empty
    }

    const gen = await mw({ messages: [], provider: {} as any }, async () => mockStream());

    const chunks: any[] = [];
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(0);
  });

  it('should handle single done chunk with slop', async () => {
    const mw = createAntiSlopStreamMiddleware({ trackSavings: false });

    async function* mockStream() {
      yield { content: 'Sure! const x = 1;', done: true };
    }

    const gen = await mw({ messages: [], provider: {} as any }, async () => mockStream());

    const chunks: any[] = [];
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    const allContent = chunks.map((c) => c.content).join('');
    expect(allContent).not.toMatch(/^Sure!/);
    expect(allContent).toContain('const x = 1;');
  });

  it('should not filter content inside code blocks in stream', async () => {
    const mw = createAntiSlopStreamMiddleware({ trackSavings: false });

    async function* mockStream() {
      yield { content: '```python\n', done: false };
      yield { content: 'Certainly! print("hello")\n', done: false };
      yield { content: '```\n', done: true };
    }

    const gen = await mw({ messages: [], provider: {} as any }, async () => mockStream());

    const chunks: any[] = [];
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    const allContent = chunks.map((c) => c.content).join('');
    expect(allContent).toContain('Certainly!');
  });
});

// =============================================================================
// createAntiSlopMiddleware (non-stream)
// =============================================================================

describe('createAntiSlopMiddleware', () => {
  it('should strip slop from non-stream response', async () => {
    const mw = createAntiSlopMiddleware({ trackSavings: false });

    const response = await mw({ messages: [], provider: {} as any }, async () => ({
      content: 'Certainly! Here is the answer.',
      role: 'assistant' as const,
    }));

    expect(response.content).not.toMatch(/^Certainly!/);
    expect(response.content).toContain('Here is the answer.');
  });

  it('should pass through response without slop', async () => {
    const mw = createAntiSlopMiddleware({ trackSavings: false });

    const response = await mw({ messages: [], provider: {} as any }, async () => ({
      content: 'The answer is 42.',
      role: 'assistant' as const,
    }));

    expect(response.content).toBe('The answer is 42.');
  });

  it('should handle empty content response', async () => {
    const mw = createAntiSlopMiddleware({ trackSavings: false });

    const response = await mw({ messages: [], provider: {} as any }, async () => ({
      content: '',
      role: 'assistant' as const,
    }));

    expect(response.content).toBe('');
  });

  it('should not filter content inside code blocks', async () => {
    const mw = createAntiSlopMiddleware({ trackSavings: false });

    const response = await mw({ messages: [], provider: {} as any }, async () => ({
      content: '```\nCertainly! const x = 1;\n```',
      role: 'assistant' as const,
    }));

    expect(response.content).toContain('Certainly!');
  });
});

// =============================================================================
// cleanSlop utility
// =============================================================================

describe('cleanSlop utility', () => {
  it('should strip slop in one call', () => {
    const result = cleanSlop('Certainly! The answer is 42.');
    expect(result).not.toMatch(/^Certainly!/);
    expect(result).toContain('The answer is 42.');
  });

  it('should handle text without slop', () => {
    const result = cleanSlop('function hello() { return 1; }');
    expect(result).toBe('function hello() { return 1; }');
  });

  it('should handle empty string', () => {
    const result = cleanSlop('');
    expect(result).toBe('');
  });

  it('should respect custom patterns', () => {
    const result = cleanSlop('As an AI, I recommend...', { customPatterns: ['As an AI'] });
    expect(result).not.toMatch(/^As an AI/);
  });

  it('should handle multiline with code blocks', () => {
    const result = cleanSlop('Sure! Explanation.\n```\nSure! code\n```\nDone.');
    expect(result).toContain('Sure! code');
  });
});

// =============================================================================
// Edge Cases & Adversarial
// =============================================================================

describe('Edge cases & adversarial', () => {
  it('should handle unicode text', () => {
    const filter = new AntiSlopFilter({ trackSavings: false });
    const result = filter.cleanChunk('Certainly! Xin chào thế giới');
    expect(result.cleaned).toContain('Xin chào thế giới');
  });

  it('should handle very long slop prefix', () => {
    const filter = new AntiSlopFilter({ trackSavings: false });
    const longSlop = 'Certainly! '.repeat(100);
    const result = filter.cleanChunk(`${longSlop}Actual content.`);
    expect(result.charsRemoved).toBeGreaterThan(0);
  });

  it('should handle pattern with special regex chars', () => {
    const f = new AntiSlopFilter({ customPatterns: ['[Note]'], trackSavings: false });
    // Should not throw — invalid regex is skipped
    expect(f).toBeDefined();
  });

  it('should handle null-like content in stream middleware', async () => {
    const mw = createAntiSlopStreamMiddleware({ trackSavings: false });

    async function* mockStream() {
      yield { content: '', done: false };
      yield { content: 'Hello', done: true };
    }

    const gen = await mw({ messages: [], provider: {} as any }, async () => mockStream());

    const chunks: any[] = [];
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    const allContent = chunks.map((c) => c.content).join('');
    expect(allContent).toBe('Hello');
  });

  it('should handle consecutive slop phrases without space', () => {
    const filter = new AntiSlopFilter({ trackSavings: false });
    const result = filter.cleanChunk('Certainly!Sure! Here is code.');
    expect(result.matchedPatterns.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle slop with newlines in between', () => {
    const filter = new AntiSlopFilter({ trackSavings: false });
    filter.resetCodeBlockState();
    const result = filter.cleanWithCodeBlockAwareness('Certainly!\nHere is code.');
    expect(result.cleaned).not.toMatch(/^Certainly!/m);
  });

  it('should handle minMatchLength of 0', () => {
    const f = new AntiSlopFilter({ minMatchLength: 0, trackSavings: false });
    const result = f.cleanChunk('Certainly! code');
    expect(result.charsRemoved).toBeGreaterThan(0);
  });

  it('should handle text that is all whitespace', () => {
    const filter = new AntiSlopFilter({ trackSavings: false });
    const result = filter.cleanChunk('   \n\t  ');
    expect(result.cleaned).toBe('   \n\t  ');
    expect(result.charsRemoved).toBe(0);
  });

  it('should handle tilde fences with different lengths', () => {
    const f = new AntiSlopFilter({ trackSavings: false });
    f.resetCodeBlockState();
    const input = '~~~~\n~~~ inside\n~~~~\nCertainly! outside';
    const result = f.cleanWithCodeBlockAwareness(input);
    expect(result.cleaned).toContain('~~~ inside');
  });

  it('should handle config with all options', () => {
    const f = new AntiSlopFilter({
      customPatterns: ['TestPattern'],
      trackSavings: true,
      minMatchLength: 3,
      slopConfigPath: '.ghita/slop.yaml',
    });
    expect(f).toBeDefined();
    expect(f.getSavingsTracker()).toBeDefined();
    expect(f.getAcMatcher()).toBeDefined();
  });
});
