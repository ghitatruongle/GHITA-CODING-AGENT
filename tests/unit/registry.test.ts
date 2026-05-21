import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderRegistry } from '../../packages/ai-engine/src/registry.js';
import type { ProviderConfig } from '../../packages/ai-engine/src/types.js';

// Mock các methods kết nối mạng thực tế của base providers
vi.mock('../../packages/ai-engine/src/providers/openai.js', () => {
  return {
    OpenAIProvider: class {
      type = 'openai';
      name = 'OpenAI';
      isReady = async () => true;
    },
  };
});

vi.mock('../../packages/ai-engine/src/providers/custom.js', () => {
  return {
    CustomProvider: class {
      type = 'custom';
      name = 'Custom';
      isReady = async () => true;
    },
  };
});

vi.mock('../../packages/ai-engine/src/providers/ollama.js', () => {
  return {
    OllamaProvider: class {
      type = 'ollama';
      name = 'Ollama';
      isReady = async () => false; // Giả sử chưa sẵn sàng để test trạng thái
    },
  };
});

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe('Đăng ký & Truy xuất cơ bản', () => {
    it('nên đăng ký và lấy được provider thủ công', () => {
      // Mock một provider tối giản
      const mockProvider: any = {
        type: 'custom',
        name: 'Mock Custom',
        isReady: async () => true,
      };

      registry.register(mockProvider);

      expect(registry.has('custom')).toBe(true);
      expect(registry.get('custom')).toBe(mockProvider);
      expect(registry.getTypes()).toEqual(['custom']);
      expect(registry.getAll()).toEqual([mockProvider]);
    });

    it('nên trả về undefined nếu lấy một provider chưa được đăng ký', () => {
      expect(registry.get('openai')).toBeUndefined();
      expect(registry.has('openai')).toBe(false);
    });

    it('nên xoá được provider đã đăng ký', () => {
      const mockProvider: any = {
        type: 'openai',
        name: 'Mock OpenAI',
      };

      registry.register(mockProvider);
      expect(registry.has('openai')).toBe(true);

      const removed = registry.remove('openai');
      expect(removed).toBe(true);
      expect(registry.has('openai')).toBe(false);
      expect(registry.get('openai')).toBeUndefined();
    });

    it('nên xoá sạch toàn bộ providers khi gọi clear', () => {
      registry.register({ type: 'openai', name: 'OpenAI' } as any);
      registry.register({ type: 'custom', name: 'Custom' } as any);

      expect(registry.getAll().length).toBe(2);

      registry.clear();
      expect(registry.getAll().length).toBe(0);
      expect(registry.getTypes()).toEqual([]);
    });
  });

  describe('Đăng ký từ cấu hình (registerFromConfig)', () => {
    it('nên tạo đúng instance CustomProvider từ config custom', () => {
      const config: ProviderConfig = {
        type: 'custom',
        name: 'My Custom API',
        defaultModel: 'llama-3',
        baseUrl: 'http://localhost:8000',
        apiKey: 'test-key',
      };

      const provider = registry.registerFromConfig(config);

      expect(provider).toBeDefined();
      expect(registry.has('custom')).toBe(true);
      expect(registry.get('custom')).toBe(provider);
    });

    it('nên ném ra lỗi nếu cấu hình provider type không tồn tại hoặc không hợp lệ', () => {
      const invalidConfig = {
        type: 'invalid-type',
        name: 'Invalid',
      } as any;

      expect(() => registry.registerFromConfig(invalidConfig)).toThrowError(
        'Unknown provider type: invalid-type'
      );
    });
  });

  describe('getStatus (Thu thập trạng thái)', () => {
    it('nên thu thập chính xác trạng thái sẵn sàng của các providers', async () => {
      // Đăng ký 2 provider, 1 cái ready (Custom) và 1 cái ko ready (Ollama)
      registry.registerFromConfig({
        type: 'custom',
        name: 'Custom',
        baseUrl: 'http://localhost:8080',
      });

      registry.registerFromConfig({
        type: 'ollama',
        name: 'Ollama',
      });

      const status = await registry.getStatus();

      expect(status).toHaveLength(2);
      
      const customStatus = status.find((s) => s.type === 'custom');
      const ollamaStatus = status.find((s) => s.type === 'ollama');

      expect(customStatus).toBeDefined();
      expect(customStatus?.ready).toBe(true);

      expect(ollamaStatus).toBeDefined();
      expect(ollamaStatus?.ready).toBe(false);
    });
  });
});
