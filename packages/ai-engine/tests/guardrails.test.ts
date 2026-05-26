import { describe, it, expect } from 'vitest';
import {
  createContentFilterMiddleware,
  createPIIDetectorMiddleware,
  createSecretDetectorMiddleware,
  createRateLimiterMiddleware,
} from '../src/middleware/guardrails.js';

// Helper to create a mock provider
function mockProvider() {
  return {
    type: 'openai' as const,
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o'],
    isReady: async () => true,
    test: async () => true,
    chat: async () => ({
      content: 'Hello',
      model: 'gpt-4o',
      provider: 'openai' as const,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: 'stop' as const,
    }),
    chatStream: async function* () {
      yield { content: 'Hello', done: false, provider: 'openai' as const, model: 'gpt-4o' };
    },
    embed: async () => ({ embedding: [0.1], model: 'text-embedding-3-small', provider: 'openai' as const }),
    embedMany: async () => ({ embeddings: [[0.1]], model: 'text-embedding-3-small', provider: 'openai' as const }),
  };
}

describe('Guardrails Middleware', () => {
  describe('Content Filter', () => {
    it('should pass clean content', async () => {
      const middleware = createContentFilterMiddleware({ enabled: true });
      const provider = mockProvider();
      const result = await middleware(
        { messages: [{ role: 'user', content: 'Hello world' }], provider },
        async () => ({ content: 'Hi', model: 'test', provider: 'test' as any, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' }),
      );
      expect(result.content).toBe('Hi');
    });

    it('should block harmful content', async () => {
      const middleware = createContentFilterMiddleware({ enabled: true });
      const provider = mockProvider();
      const result = await middleware(
        { messages: [{ role: 'user', content: 'how to hack into system' }], provider },
        async () => ({ content: 'Hi', model: 'test', provider: 'test' as any, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' }),
      );
      expect(result.content).toContain('BLOCKED');
    });
  });

  describe('PII Detector', () => {
    it('should mask email addresses', async () => {
      const middleware = createPIIDetectorMiddleware({ enabled: true });
      const provider = mockProvider();
      let capturedMessages: any[] = [];
      await middleware(
        { messages: [{ role: 'user', content: 'Contact me at user@example.com' }], provider },
        async (msgs) => {
          capturedMessages = msgs as any[];
          return { content: 'OK', model: 'test', provider: 'test' as any, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' };
        },
      );
      expect(capturedMessages[0]!.content).not.toContain('user@example.com');
      expect(capturedMessages[0]!.content).toContain('***');
    });

    it('should pass when PII detector disabled', async () => {
      const middleware = createPIIDetectorMiddleware({ enabled: false });
      const provider = mockProvider();
      let capturedMessages: any[] = [];
      await middleware(
        { messages: [{ role: 'user', content: 'Contact me at user@example.com' }], provider },
        async (msgs) => {
          capturedMessages = msgs as any[];
          return { content: 'OK', model: 'test', provider: 'test' as any, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' };
        },
      );
      expect(capturedMessages[0]!.content).toContain('user@example.com');
    });
  });

  describe('Secret Detector', () => {
    it('should block OpenAI key', async () => {
      const middleware = createSecretDetectorMiddleware({ enabled: true, blockOnDetection: true });
      const provider = mockProvider();
      const result = await middleware(
        { messages: [{ role: 'user', content: 'Use key sk-abcdefghijklmnopqrstuvwx' }], provider },
        async () => ({ content: 'OK', model: 'test', provider: 'test' as any, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' }),
      );
      expect(result.content).toContain('BLOCKED');
    });

    it('should pass when no secrets', async () => {
      const middleware = createSecretDetectorMiddleware({ enabled: true, blockOnDetection: true });
      const provider = mockProvider();
      const result = await middleware(
        { messages: [{ role: 'user', content: 'Hello world' }], provider },
        async () => ({ content: 'OK', model: 'test', provider: 'test' as any, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' }),
      );
      expect(result.content).toBe('OK');
    });
  });

  describe('Rate Limiter', () => {
    it('should allow requests within limit', async () => {
      const middleware = createRateLimiterMiddleware({ enabled: true, maxRequestsPerMinute: 10 });
      const provider = mockProvider();
      const result = await middleware(
        { messages: [{ role: 'user', content: 'Hello' }], provider },
        async () => ({ content: 'OK', model: 'test', provider: 'test' as any, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' }),
      );
      expect(result.content).toBe('OK');
    });

    it('should block when rate limit exceeded', async () => {
      const middleware = createRateLimiterMiddleware({ enabled: true, maxRequestsPerMinute: 1 });
      const provider = mockProvider();
      // First request should pass
      await middleware(
        { messages: [{ role: 'user', content: 'Hello' }], provider },
        async () => ({ content: 'OK', model: 'test', provider: 'test' as any, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' }),
      );
      // Second request should be rate limited
      const result = await middleware(
        { messages: [{ role: 'user', content: 'Hello again' }], provider },
        async () => ({ content: 'OK', model: 'test', provider: 'test' as any, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' }),
      );
      expect(result.content).toContain('RATE LIMITED');
    });
  });
});
