import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider, AnthropicProvider, OllamaProvider, GroqProvider } from '@ghita/ai-engine';

describe('AI Engine - Providers', () => {
  describe('OpenAIProvider', () => {
    it('should construct with valid config', () => {
      const provider = new OpenAIProvider({
        apiKey: 'sk-test-123',
        model: 'gpt-4o',
      });
      expect(provider.type).toBe('openai');
      expect(provider.defaultModel).toBe('gpt-4o');
    });

    it('should return correct models list', () => {
      const provider = new OpenAIProvider({
        apiKey: 'sk-test-123',
        model: 'gpt-4o',
      });
      expect(provider.models).toContain('gpt-4o');
      expect(provider.models).toContain('gpt-4o-mini');
    });

    it('should report not ready without healthy keys', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'sk-test-bad',
        model: 'gpt-4o',
      });
      vi.spyOn(provider['keyManager'], 'hasHealthyKey').mockReturnValue(false);
      const ready = await provider.isReady();
      expect(ready).toBe(false);
    });

    it('should report ready with healthy keys', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'sk-test-good',
        model: 'gpt-4o',
      });
      vi.spyOn(provider['keyManager'], 'hasHealthyKey').mockReturnValue(true);
      const ready = await provider.isReady();
      expect(ready).toBe(true);
    });
  });

  describe('AnthropicProvider', () => {
    it('should construct with valid config', () => {
      const provider = new AnthropicProvider({
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4',
      });
      expect(provider.type).toBe('anthropic');
    });
  });

  describe('OllamaProvider', () => {
    it('should use base URL from config', () => {
      const provider = new OllamaProvider({
        baseUrl: 'http://localhost:11434',
        model: 'llama3',
      });
      expect(provider.type).toBe('ollama');
      expect(provider.config.baseUrl).toContain('localhost');
    });
  });

  describe('GroqProvider', () => {
    it('should construct with valid config', () => {
      const provider = new GroqProvider({
        apiKey: 'gsk-test',
        model: 'mixtral-8x7b',
      });
      expect(provider.type).toBe('groq');
    });
  });
});
