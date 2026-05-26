import { describe, it, expect } from 'vitest';
import { parseOpenAICompat, parseOllamaTags, parseGoogleModels, parseReplicateModels } from '../src/discovery/model-discovery.js';

describe('Model Discovery Parsers', () => {
  describe('parseOpenAICompat', () => {
    it('should parse standard OpenAI format', () => {
      const data = { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] };
      const result = parseOpenAICompat(data);
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('gpt-4o');
      expect(result[0]!.name).toBe('gpt-4o');
    });

    it('should handle empty data', () => {
      const result = parseOpenAICompat({ data: [] });
      expect(result).toHaveLength(0);
    });

    it('should handle missing data field', () => {
      const result = parseOpenAICompat({});
      expect(result).toHaveLength(0);
    });
  });

  describe('parseOllamaTags', () => {
    it('should parse Ollama format', () => {
      const data = { models: [{ name: 'llama3.1:8b' }, { name: 'mistral:7b' }] };
      const result = parseOllamaTags(data);
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('llama3.1:8b');
      expect(result[0]!.provider).toBe('ollama');
    });
  });

  describe('parseGoogleModels', () => {
    it('should strip models/ prefix', () => {
      const data = { models: [{ name: 'models/gemini-1.5-pro' }, { name: 'models/gemini-2.0-flash' }] };
      const result = parseGoogleModels(data);
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('gemini-1.5-pro');
      expect(result[0]!.provider).toBe('google');
    });
  });

  describe('parseReplicateModels', () => {
    it('should parse Replicate format', () => {
      const data = { results: [{ name: 'meta/llama-3.1-8b-instruct' }] };
      const result = parseReplicateModels(data);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('meta/llama-3.1-8b-instruct');
      expect(result[0]!.provider).toBe('replicate');
    });
  });
});
