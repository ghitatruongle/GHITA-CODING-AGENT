import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateMessagesTokens, fitsInContext, truncateToFit, getContextInfo } from '../src/utils/token-counter.js';

describe('Token Counter', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens for text', () => {
      const tokens = estimateTokens('Hello world, this is a test message.');
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should estimate more tokens for longer text', () => {
      const short = estimateTokens('Hello');
      const long = estimateTokens('Hello world, this is a much longer message with many more words and characters.');
      expect(long).toBeGreaterThan(short);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should estimate tokens for messages', () => {
      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: 'Hello!' },
        { role: 'assistant' as const, content: 'Hi there! How can I help?' },
      ];
      const tokens = estimateMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle empty messages', () => {
      expect(estimateMessagesTokens([])).toBe(2); // reply priming
    });
  });

  describe('fitsInContext', () => {
    it('should fit small messages in large context', () => {
      const result = fitsInContext(
        [{ role: 'user' as const, content: 'Hello' }],
        128000,
      );
      expect(result.fits).toBe(true);
      expect(result.available).toBeGreaterThan(0);
    });

    it('should not fit huge messages in small context', () => {
      const hugeContent = 'x'.repeat(100000);
      const result = fitsInContext(
        [{ role: 'user' as const, content: hugeContent }],
        100,
      );
      expect(result.fits).toBe(false);
    });
  });

  describe('truncateToFit', () => {
    it('should keep system messages', () => {
      const messages = [
        { role: 'system' as const, content: 'System prompt' },
        { role: 'user' as const, content: 'Message 1' },
        { role: 'assistant' as const, content: 'Response 1' },
        { role: 'user' as const, content: 'Message 2' },
      ];
      const result = truncateToFit(messages, 128000);
      expect(result.length).toBe(4); // all fit
    });

    it('should truncate old messages when context is small', () => {
      const messages = [
        { role: 'system' as const, content: 'System' },
        { role: 'user' as const, content: 'x'.repeat(1000) },
        { role: 'assistant' as const, content: 'y'.repeat(1000) },
        { role: 'user' as const, content: 'z'.repeat(1000) },
      ];
      const result = truncateToFit(messages, 50);
      expect(result.length).toBeLessThan(4);
      // System message should always be kept
      expect(result[0]!.role).toBe('system');
    });
  });

  describe('getContextInfo', () => {
    it('should return context window info', () => {
      const info = getContextInfo(
        [{ role: 'user' as const, content: 'Hello' }],
        128000,
      );
      expect(info.maxTokens).toBe(128000);
      expect(info.usedTokens).toBeGreaterThan(0);
      expect(info.remainingTokens).toBeGreaterThan(0);
      expect(info.usagePercent).toBeLessThan(1);
    });
  });
});
