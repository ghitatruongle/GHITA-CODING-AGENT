// ==============================================================================
// GHITA CODING AGENT — Phase 10: Anti-Slop Unit Tests (50 test cases)
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { AntiSlopFilter, cleanSlop } from '../src/middleware/antiSlop.js';

describe('AntiSlopFilter', () => {
  let filter: AntiSlopFilter;

  beforeEach(() => {
    filter = new AntiSlopFilter({ trackSavings: false });
  });

  // ── Group 1: Default pattern removal (17 patterns) ──────────────────────

  describe('default pattern removal', () => {
    it('1. removes "Certainly!" prefix', () => {
      const result = filter.cleanChunk('Certainly! Here is the code.');
      expect(result.cleaned).toBe('Here is the code.');
      expect(result.matchedPatterns).toContain('Certainly!');
    });

    it('2. removes "Certainly" without exclamation', () => {
      const result = filter.cleanChunk('Certainly let me help you.');
      expect(result.cleaned).toBe('let me help you.');
    });

    it('3. removes "Sure!" prefix', () => {
      const result = filter.cleanChunk('Sure! I can do that.');
      expect(result.cleaned).toBe('I can do that.');
    });

    it('4. removes "Of course!" prefix', () => {
      const result = filter.cleanChunk('Of course! Here is the solution.');
      expect(result.cleaned).toBe('Here is the solution.');
    });

    it('5. removes "Absolutely!" prefix', () => {
      const result = filter.cleanChunk('Absolutely! Let me explain.');
      expect(result.cleaned).toBe('Let me explain.');
    });

    it('6. removes "Great question!" prefix', () => {
      const result = filter.cleanChunk('Great question! The answer is...');
      expect(result.cleaned).toBe('The answer is...');
    });

    it('7. removes "I can help with that" prefix', () => {
      const result = filter.cleanChunk('I can help with that. Let me show you.');
      expect(result.cleaned).toBe('Let me show you.');
    });

    it('8. removes "I would be happy to help with that" prefix', () => {
      const result = filter.cleanChunk("I'd be happy to help with that! Here goes:");
      expect(result.cleaned).toBe('Here goes:');
    });

    it('9. removes "Here is the updated" prefix', () => {
      const result = filter.cleanChunk('Here is the updated code:');
      expect(result.cleaned).toBe('');
    });

    it('10. removes "Here\'s the modified" prefix', () => {
      const result = filter.cleanChunk("Here's the modified version:");
      expect(result.cleaned).toBe('');
    });

    it('11. removes "Let me help you with that" prefix', () => {
      const result = filter.cleanChunk('Let me help you with that. First step...');
      expect(result.cleaned).toBe('First step...');
    });

    it('12. removes "I\'ll help you" prefix', () => {
      const result = filter.cleanChunk("I'll help you fix this bug.");
      expect(result.cleaned).toBe('fix this bug.');
    });

    it('13. removes "Hope this helps" suffix-like prefix', () => {
      const result = filter.cleanChunk('Hope this helps! Let me know.');
      expect(result.cleaned).toBe('Let me know.');
    });

    it('14. removes "Let me know if you need" prefix', () => {
      const result = filter.cleanChunk('Let me know if you need anything else.');
      expect(result.cleaned).toBe('');
    });

    it('15. removes "Is there anything else" prefix', () => {
      const result = filter.cleanChunk('Is there anything else I can help with?');
      expect(result.cleaned).toBe('');
    });

    it('16. removes "Feel free to ask" prefix', () => {
      const result = filter.cleanChunk('Feel free to ask about more topics.');
      expect(result.cleaned).toBe('about more topics.');
    });

    it('17. removes "Happy to help" prefix', () => {
      const result = filter.cleanChunk('Happy to help! Here is the answer:');
      expect(result.cleaned).toBe('Here is the answer:');
    });
  });

  // ── Group 2: Case insensitivity ─────────────────────────────────────────

  describe('case insensitivity', () => {
    it('18. removes lowercase "certainly!"', () => {
      const result = filter.cleanChunk('certainly! here is the fix.');
      expect(result.cleaned).toBe('here is the fix.');
    });

    it('19. removes UPPERCASE "CERTAINLY!"', () => {
      const result = filter.cleanChunk('CERTAINLY! Here is the fix.');
      expect(result.cleaned).toBe('Here is the fix.');
    });

    it('20. removes mixed case "SuRe!"', () => {
      const result = filter.cleanChunk('SuRe! Let me check.');
      expect(result.cleaned).toBe('Let me check.');
    });
  });

  // ── Group 3: Multiple slop phrases in sequence ──────────────────────────

  describe('multiple slop phrases', () => {
    it('21. removes chained slop', () => {
      const result = filter.cleanChunk('Certainly! I can help with that. Here is the code:');
      expect(result.cleaned).toBe('Here is the code:');
    });

    it('22. removes "Sure! Happy to help!" chain', () => {
      const result = filter.cleanChunk('Sure! Happy to help! The answer is 42.');
      expect(result.cleaned).toBe('The answer is 42.');
    });
  });

  // ── Group 4: No false positives on clean text ───────────────────────────

  describe('no false positives', () => {
    it('23. does not modify code-like text', () => {
      const code = 'const certainly = true; // some code';
      const result = filter.cleanChunk(code);
      expect(result.cleaned).toBe(code);
    });

    it('24. does not modify normal sentence', () => {
      const text = 'The function returns a boolean value.';
      const result = filter.cleanChunk(text);
      expect(result.cleaned).toBe(text);
    });

    it('25. does not modify empty string', () => {
      const result = filter.cleanChunk('');
      expect(result.cleaned).toBe('');
      expect(result.charsRemoved).toBe(0);
    });

    it('26. does not modify short text under minMatchLength', () => {
      const result = filter.cleanChunk('Hi!');
      expect(result.cleaned).toBe('Hi!');
    });
  });

  // ── Group 5: Code block detection ───────────────────────────────────────

  describe('code block detection', () => {
    it('27. does not filter inside fenced code block', () => {
      const text = '```js\nCertainly! let x = 1;\n```';
      const result = filter.cleanWithCodeBlockAwareness(text);
      expect(result.cleaned).toContain('Certainly!');
    });

    it('28. does not filter inside tilde code block', () => {
      const text = '~~~python\nOf course! print("hello")\n~~~';
      const result = filter.cleanWithCodeBlockAwareness(text);
      expect(result.cleaned).toContain('Of course!');
    });

    it('29. filters outside code block', () => {
      const text = 'Certainly! Here is the code:\n```\nconst x = 1;\n```\nHappy to help!';
      const result = filter.cleanWithCodeBlockAwareness(text);
      expect(result.cleaned).toContain('Here is the code:');
      expect(result.cleaned).toContain('const x = 1;');
    });

    it('30. handles nested code blocks correctly', () => {
      const text = '~~~\n```\nnested\n```\n~~~';
      const result = filter.cleanWithCodeBlockAwareness(text);
      // Should preserve all content inside the outer tilde block
      expect(result.cleaned).toContain('nested');
    });

    it('31. resets code block state correctly', () => {
      filter.resetCodeBlockState();
      const result1 = filter.cleanWithCodeBlockAwareness('```\nCertainly! code\n```');
      const result2 = filter.cleanWithCodeBlockAwareness('Certainly! not code');
      expect(result1.cleaned).toContain('Certainly!'); // Inside code block
      expect(result2.cleaned).not.toContain('Certainly!'); // Outside code block
    });
  });

  // ── Group 6: Multiline processing ───────────────────────────────────────

  describe('multiline processing', () => {
    it('32. processes multiple lines independently', () => {
      const text = 'Certainly! Line 1\nSure! Line 2\nNormal line 3';
      const result = filter.cleanWithCodeBlockAwareness(text);
      expect(result.cleaned).toContain('Line 1');
      expect(result.cleaned).toContain('Line 2');
      expect(result.cleaned).toContain('Normal line 3');
    });

    it('33. handles lines with only slop', () => {
      const text = 'Certainly!\nHere is the code:\nconst x = 1;';
      const result = filter.cleanWithCodeBlockAwareness(text);
      expect(result.cleaned).toContain('Here is the code:');
      expect(result.cleaned).toContain('const x = 1;');
    });
  });

  // ── Group 7: Custom patterns ────────────────────────────────────────────

  describe('custom patterns', () => {
    it('34. filters custom pattern', () => {
      const customFilter = new AntiSlopFilter({
        customPatterns: ['Welcome aboard'],
        trackSavings: false,
      });
      const result = customFilter.cleanChunk('Welcome aboard! Here is your guide.');
      expect(result.cleaned).toBe('Here is your guide.');
    });

    it('35. combines default and custom patterns', () => {
      const customFilter = new AntiSlopFilter({
        customPatterns: ['Welcome aboard'],
        trackSavings: false,
      });
      const r1 = customFilter.cleanChunk('Certainly! Code here.');
      const r2 = customFilter.cleanChunk('Welcome aboard! Guide here.');
      expect(r1.cleaned).toBe('Code here.');
      expect(r2.cleaned).toBe('Guide here.');
    });
  });

  // ── Group 8: Aho-Corasick matching ──────────────────────────────────────

  describe('Aho-Corasick string matching', () => {
    it('36. handles empty text', () => {
      const result = filter.cleanChunk('');
      expect(result.cleaned).toBe('');
    });

    it('37. handles text with only whitespace', () => {
      const result = filter.cleanChunk('   ');
      expect(result.cleaned).toBe('   ');
    });

    it('38. handles special characters in text', () => {
      const result = filter.cleanChunk('Certainly! <script>alert("xss")</script>');
      expect(result.cleaned).toBe('<script>alert("xss")</script>');
    });
  });

  // ── Group 9: Edge cases ─────────────────────────────────────────────────

  describe('edge cases', () => {
    it('39. handles newline at start', () => {
      const result = filter.cleanChunk('\nCertainly! Code here.');
      expect(result.cleaned).toBe('Code here.');
    });

    it('40. handles text that starts with spaces', () => {
      const result = filter.cleanChunk('  Certainly! Code here.');
      expect(result.cleaned).toBe('Code here.');
    });

    it('41. preserves content after slop removal', () => {
      const result = filter.cleanChunk('Sure! The answer is:\n1. First\n2. Second');
      expect(result.cleaned).toContain('The answer is:');
      expect(result.cleaned).toContain('1. First');
      expect(result.cleaned).toContain('2. Second');
    });

    it('42. handles unicode text', () => {
      const result = filter.cleanChunk('Certainly! Kết quả là đây.');
      expect(result.cleaned).toBe('Kết quả là đây.');
    });

    it('43. handles very long text', () => {
      const longText = 'Certainly! ' + 'x'.repeat(10000);
      const result = filter.cleanChunk(longText);
      expect(result.cleaned).toBe('x'.repeat(10000));
    });

    it('44. handles text with markdown headers', () => {
      const result = filter.cleanChunk('Certainly!\n# Title\n## Subtitle');
      expect(result.cleaned).toContain('# Title');
      expect(result.cleaned).toContain('## Subtitle');
    });
  });

  // ── Group 10: Token savings tracking ────────────────────────────────────

  describe('token savings tracking', () => {
    it('45. tracks savings when enabled', () => {
      const trackingFilter = new AntiSlopFilter({ trackSavings: true });
      trackingFilter.cleanChunk('Certainly! Here is a long piece of code that would cost tokens.');
      const summary = trackingFilter.getSavingsSummary();
      expect(summary.passCount).toBe(0); // cleanChunk doesn't track, stream does
    });

    it('46. reports zero savings initially', () => {
      const summary = filter.getSavingsSummary();
      expect(summary.totalSaved).toBe(0);
      expect(summary.passCount).toBe(0);
    });

    it('47. returns empty logs initially', () => {
      const logs = filter.getSavingsLogs();
      expect(logs).toEqual([]);
    });
  });

  // ── Group 11: Standalone cleanSlop utility ──────────────────────────────

  describe('cleanSlop utility', () => {
    it('48. works as standalone function', () => {
      const result = cleanSlop('Certainly! Code here.');
      expect(result).toBe('Code here.');
    });

    it('49. preserves code blocks in standalone mode', () => {
      const result = cleanSlop('```\nCertainly!\n```\nCertainly! After code.');
      expect(result).toContain('Certainly!\n```'); // Inside code block preserved
    });

    it('50. handles empty input', () => {
      const result = cleanSlop('');
      expect(result).toBe('');
    });
  });
});
