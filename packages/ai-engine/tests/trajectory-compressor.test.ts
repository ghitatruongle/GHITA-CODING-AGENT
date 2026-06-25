// ==============================================================================
// GHITA CODING AGENT - TrajectoryCompressor Unit Tests
// 30 test cases covering analysis, compression, async compression,
// config management, edge cases, and Vietnamese content.
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { TrajectoryCompressor } from '../src/context/compressor.js';
import type { ChatMessage } from '../src/types.js';

function msg(role: 'user' | 'assistant' | 'system', content: string): ChatMessage {
  return { role, content };
}

describe('TrajectoryCompressor', () => {
  let comp: TrajectoryCompressor;

  beforeEach(() => {
    comp = new TrajectoryCompressor({
      maxTokens: 1000,
      targetRatio: 0.5,
      preserveRecentCount: 3,
    });
  });

  // ── Group 1: analyzeMessages (8 tests) ─────────────────────────────────

  describe('analyzeMessages', () => {
    it('1. recent messages are always critical', () => {
      const messages: ChatMessage[] = [
        msg('user', 'old message'),
        msg('assistant', 'another old'),
        msg('user', 'recent 1'),
        msg('assistant', 'recent 2'),
        msg('user', 'recent 3'),
      ];
      const analyses = comp.analyzeMessages(messages);
      // Last 3 should be critical
      expect(analyses[2]!.importance).toBe('critical');
      expect(analyses[3]!.importance).toBe('critical');
      expect(analyses[4]!.importance).toBe('critical');
    });

    it('2. system messages are critical when preserveSystemMessages=true', () => {
      const messages: ChatMessage[] = [
        msg('system', 'You are a coding assistant'),
        msg('user', 'hello'),
        msg('user', 'recent 1'),
        msg('user', 'recent 2'),
        msg('user', 'recent 3'),
      ];
      const analyses = comp.analyzeMessages(messages);
      expect(analyses[0]!.importance).toBe('critical');
      expect(analyses[0]!.reason).toContain('System message');
    });

    it('3. error messages are high importance', () => {
      const messages: ChatMessage[] = [
        msg('assistant', 'TypeError: Cannot read property of undefined'),
        msg('user', 'recent 1'),
        msg('user', 'recent 2'),
        msg('user', 'recent 3'),
      ];
      const analyses = comp.analyzeMessages(messages);
      expect(analyses[0]!.importance).toBe('high');
      expect(analyses[0]!.isError).toBe(true);
    });

    it('4. decision messages are high importance', () => {
      const messages: ChatMessage[] = [
        msg('assistant', 'I decided to use React for the frontend'),
        msg('user', 'recent 1'),
        msg('user', 'recent 2'),
        msg('user', 'recent 3'),
      ];
      const analyses = comp.analyzeMessages(messages);
      expect(analyses[0]!.importance).toBe('high');
      expect(analyses[0]!.isDecision).toBe(true);
    });

    it('5. Vietnamese decision patterns detected', () => {
      const messages: ChatMessage[] = [
        msg('assistant', 'Quyết định sử dụng TypeScript cho dự án'),
        msg('user', 'recent 1'),
        msg('user', 'recent 2'),
        msg('user', 'recent 3'),
      ];
      const analyses = comp.analyzeMessages(messages);
      expect(analyses[0]!.isDecision).toBe(true);
    });

    it('6. Vietnamese error patterns detected', () => {
      const messages: ChatMessage[] = [
        msg('assistant', 'Đã xảy ra lỗi không thể kết nối'),
        msg('user', 'recent 1'),
        msg('user', 'recent 2'),
        msg('user', 'recent 3'),
      ];
      const analyses = comp.analyzeMessages(messages);
      expect(analyses[0]!.isError).toBe(true);
    });

    it('7. long messages are low importance', () => {
      const longContent = 'x'.repeat(3000);
      const messages: ChatMessage[] = [
        msg('assistant', longContent),
        msg('user', 'recent 1'),
        msg('user', 'recent 2'),
        msg('user', 'recent 3'),
      ];
      const analyses = comp.analyzeMessages(messages);
      expect(analyses[0]!.importance).toBe('low');
    });

    it('8. very short messages are low importance', () => {
      const messages: ChatMessage[] = [
        msg('user', 'ok'),
        msg('user', 'recent 1'),
        msg('user', 'recent 2'),
        msg('user', 'recent 3'),
      ];
      const analyses = comp.analyzeMessages(messages);
      expect(analyses[0]!.importance).toBe('low');
    });
  });

  // ── Group 2: compress (8 tests) ────────────────────────────────────────

  describe('compress', () => {
    it('9. no compression when under token budget', () => {
      const messages = [msg('user', 'hello'), msg('assistant', 'world')];
      const result = comp.compress(messages);
      expect(result.compressionRatio).toBe(1);
      expect(result.messages).toEqual(messages);
    });

    it('10. compression reduces message count', () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 50; i++) {
        messages.push(
          msg(
            'user',
            `This is message number ${i} with some padding text to make it longer`.repeat(3),
          ),
        );
        messages.push(msg('assistant', `Response to message ${i} with explanation`.repeat(3)));
      }
      const result = comp.compress(messages);
      expect(result.compressedCount).toBeLessThan(result.originalCount);
    });

    it('11. recent messages always preserved', () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push(msg('user', `old message ${i} with some extra content to make it longer`));
      }
      // Add 3 recent
      messages.push(msg('user', 'RECENT1'));
      messages.push(msg('user', 'RECENT2'));
      messages.push(msg('user', 'RECENT3'));

      const result = comp.compress(messages);
      const contents = result.messages.map((m) => m.content);
      expect(contents).toContain('RECENT1');
      expect(contents).toContain('RECENT2');
      expect(contents).toContain('RECENT3');
    });

    it('12. system messages preserved', () => {
      const messages: ChatMessage[] = [msg('system', 'You are an expert developer')];
      for (let i = 0; i < 30; i++) {
        messages.push(msg('user', `filler message ${i} that should be compressed eventually`));
      }
      const result = comp.compress(messages);
      const systemMsgs = result.messages.filter((m) => m.role === 'system');
      expect(systemMsgs.length).toBeGreaterThanOrEqual(1);
    });

    it('13. compressed messages contain [Compressed] markers', () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push(msg('user', `filler message ${i} to exceed token budget`.repeat(3)));
      }
      const result = comp.compress(messages);
      const compressed = result.messages.filter((m) => m.content.includes('[Compressed'));
      expect(compressed.length).toBeGreaterThan(0);
    });

    it('14. compressionRatio is between 0 and 1 for large inputs', () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 50; i++) {
        messages.push(msg('user', `message ${i} content`.repeat(5)));
      }
      const result = comp.compress(messages);
      expect(result.compressionRatio).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeLessThan(1);
    });

    it('15. originalCount matches input length', () => {
      const messages = [msg('user', 'a'), msg('user', 'b')];
      const result = comp.compress(messages);
      expect(result.originalCount).toBe(messages.length);
    });

    it('16. compressedTokens <= originalTokens', () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 40; i++) {
        messages.push(msg('user', `message ${i} with content`.repeat(4)));
      }
      const result = comp.compress(messages);
      expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
    });
  });

  // ── Group 3: compressAsync (4 tests) ───────────────────────────────────

  describe('compressAsync', () => {
    it('17. no compression when under budget', async () => {
      const messages = [msg('user', 'short')];
      const result = await comp.compressAsync(messages, async () => 'summary');
      expect(result.compressionRatio).toBe(1);
    });

    it('18. uses LLM summary for old messages', async () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push(msg('user', `old message ${i} with some content`.repeat(5)));
      }
      messages.push(msg('user', 'recent1'));
      messages.push(msg('user', 'recent2'));
      messages.push(msg('user', 'recent3'));

      let summarizerCalled = false;
      const result = await comp.compressAsync(messages, async (msgs) => {
        summarizerCalled = true;
        return `Summary of ${msgs.length} messages`;
      });

      expect(summarizerCalled).toBe(true);
      expect(result.compressedCount).toBeLessThan(result.originalCount);
    });

    it('19. falls back to rule-based when summarizer throws', async () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push(msg('user', `message ${i} with content`.repeat(5)));
      }
      const result = await comp.compressAsync(messages, async () => {
        throw new Error('LLM unavailable');
      });
      // Should not throw, should use rule-based
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('20. summary message has system role', async () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push(msg('user', `msg ${i} with lots of content here`.repeat(5)));
      }
      messages.push(msg('user', 'r1'));
      messages.push(msg('user', 'r2'));
      messages.push(msg('user', 'r3'));

      const result = await comp.compressAsync(messages, async () => 'compressed summary');
      const sysMsgs = result.messages.filter(
        (m) => m.role === 'system' && m.content.includes('Trajectory Summary'),
      );
      expect(sysMsgs.length).toBe(1);
    });
  });

  // ── Group 4: Config management (4 tests) ───────────────────────────────

  describe('config', () => {
    it('21. getConfig returns copy', () => {
      const cfg = comp.getConfig();
      cfg.maxTokens = 999;
      expect(comp.getConfig().maxTokens).toBe(1000);
    });

    it('22. updateConfig modifies settings', () => {
      comp.updateConfig({ maxTokens: 5000 });
      expect(comp.getConfig().maxTokens).toBe(5000);
    });

    it('23. default config values are applied', () => {
      const def = new TrajectoryCompressor();
      const cfg = def.getConfig();
      expect(cfg.maxTokens).toBe(128000);
      expect(cfg.targetRatio).toBe(0.5);
      expect(cfg.preserveRecentCount).toBe(10);
      expect(cfg.preserveSystemMessages).toBe(true);
    });

    it('24. custom patterns override defaults', () => {
      const custom = new TrajectoryCompressor({
        decisionPatterns: [/CUSTOM_DECISION/],
        errorPatterns: [/CUSTOM_ERROR/],
      });
      const messages: ChatMessage[] = [
        msg('assistant', 'CUSTOM_DECISION here'),
        msg('user', 'r1'),
        msg('user', 'r2'),
        msg('user', 'r3'),
      ];
      const analyses = custom.analyzeMessages(messages);
      expect(analyses[0]!.isDecision).toBe(true);
    });
  });

  // ── Group 5: Edge cases (6 tests) ──────────────────────────────────────

  describe('edge cases', () => {
    it('25. empty messages array', () => {
      const result = comp.compress([]);
      expect(result.messages).toEqual([]);
      expect(result.compressionRatio).toBe(1);
    });

    it('26. single message', () => {
      const result = comp.compress([msg('user', 'hello')]);
      expect(result.messages).toHaveLength(1);
    });

    it('27. all system messages', () => {
      const messages = Array.from({ length: 10 }, (_, i) => msg('system', `sys ${i}`));
      const result = comp.compress(messages);
      expect(result.messages.every((m) => m.role === 'system')).toBe(true);
    });

    it('28. code blocks in content are handled', () => {
      const codeMsg = msg('assistant', 'Here is code:\n```ts\nconst x = 1;\n```\nEnd of code');
      const messages: ChatMessage[] = [codeMsg];
      for (let i = 0; i < 20; i++) messages.push(msg('user', `filler ${i}`.repeat(5)));
      const result = comp.compress(messages);
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('29. estimated tokens are reasonable', () => {
      const messages = [msg('user', 'Hello world')];
      const analyses = comp.analyzeMessages(messages);
      // "Hello world" = 11 chars → ceil(11/3) + 4 = 8 tokens
      expect(analyses[0]!.estimatedTokens).toBe(8);
    });

    it('30. compression preserves message role types', () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push(msg(i % 2 === 0 ? 'user' : 'assistant', `msg ${i} content`.repeat(4)));
      }
      const result = comp.compress(messages);
      for (const m of result.messages) {
        expect(['user', 'assistant', 'system']).toContain(m.role);
      }
    });
  });
});
