import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../../packages/ai-engine/src/orchestrator.js';
import type {
  OrchestratorConfig,
  ChatMessage,
  ChatResponse,
} from '../../packages/ai-engine/src/types.js';

// Mock các class providers
const mockChatFn = vi.fn();
const mockIsReadyFn = vi.fn();

vi.mock('../../packages/ai-engine/src/providers/openai.js', () => {
  return {
    OpenAIProvider: class {
      type = 'openai';
      name = 'OpenAI';
      isReady = mockIsReadyFn;
      chat = mockChatFn;
      async *chatStream() {
        yield { content: 'openai stream chunk', done: false, provider: 'openai' };
        yield { content: '', done: true, provider: 'openai' };
      }
    },
  };
});

vi.mock('../../packages/ai-engine/src/providers/anthropic.js', () => {
  return {
    AnthropicProvider: class {
      type = 'anthropic';
      name = 'Anthropic';
      isReady = async () => true;
      chat = mockChatFn;
      async *chatStream() {
        yield { content: 'anthropic stream chunk', done: false, provider: 'anthropic' };
        yield { content: '', done: true, provider: 'anthropic' };
      }
    },
  };
});

vi.mock('../../packages/ai-engine/src/providers/google.js', () => {
  return {
    GoogleProvider: class {
      type = 'google';
      name = 'Google';
      isReady = async () => true;
      chat = mockChatFn;
    },
  };
});

describe('Orchestrator (AI Multi-Provider Coordinator)', () => {
  let config: OrchestratorConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      providers: [
        { type: 'openai', name: 'OpenAI', apiKey: 'op-123' },
        { type: 'anthropic', name: 'Anthropic', apiKey: 'an-123' },
        { type: 'google', name: 'Google', apiKey: 'go-123' },
      ],
      defaultProvider: 'openai',
      fallbackOrder: ['anthropic', 'google'],
      retryAttempts: 2,
      retryDelayMs: 1, // Đặt delay siêu nhỏ để test chạy nhanh
      routing: {
        researcher: 'anthropic',
        coder: 'openai',
        default: 'openai',
      },
    };
  });

  describe('Khởi tạo và Phân giải Nhà Cung Cấp (Provider Resolution)', () => {
    it('nên đăng ký đầy đủ các providers từ cấu hình', () => {
      const orchestrator = new Orchestrator(config);
      const registry = orchestrator.getRegistry();

      expect(registry.has('openai')).toBe(true);
      expect(registry.has('anthropic')).toBe(true);
      expect(registry.has('google')).toBe(true);
      expect(registry.getAll().length).toBe(3);
    });

    it('nên lấy đúng status tổng quan của Orchestrator', async () => {
      mockIsReadyFn.mockResolvedValueOnce(true); // openai ready
      const orchestrator = new Orchestrator(config);
      const status = await orchestrator.getStatus();

      expect(status.totalProviders).toBe(3);
      expect(status.readyProviders).toBe(3); // openai (true), anthropic (true), google (true)
      expect(status.defaultProvider).toBe('openai');
      expect(status.availableProviders).toContain('openai');
    });

    it('nên định tuyến chính xác theo agentRole (Routing)', async () => {
      const orchestrator = new Orchestrator(config);

      const mockResult: ChatResponse = {
        content: 'resolved content',
        model: 'model',
        provider: 'mock',
        finishReason: 'stop',
      };
      mockChatFn.mockResolvedValue(mockResult);

      // Thử với role 'researcher' -> nên gọi Anthropic
      await orchestrator.chat([{ role: 'user', content: 'test' }], { agentRole: 'researcher' });

      // Kiểm tra xem Anthropic provider có được resolve và gọi chat không
      // Ở đây mockChatFn được dùng chung, chúng ta có thể kiểm tra provider được chọn thông qua registry
      const resolved = (orchestrator as any).resolveProvider(undefined, 'researcher');
      expect(resolved.type).toBe('anthropic');

      const resolvedCoder = (orchestrator as any).resolveProvider(undefined, 'coder');
      expect(resolvedCoder.type).toBe('openai');
    });

    it('nên ưu tiên preferred provider truyền trực tiếp trước default provider', () => {
      const orchestrator = new Orchestrator(config);
      const resolved = (orchestrator as any).resolveProvider('google', 'researcher');
      expect(resolved.type).toBe('google'); // preferred 'google' thắng routing 'anthropic'
    });
  });

  describe('Cơ chế Tự Động Thử Lại & Dự Phòng (Retry & Fallback)', () => {
    it('nên chạy thành công ở provider chính nếu không có lỗi', async () => {
      const orchestrator = new Orchestrator(config);
      const expectedResponse: ChatResponse = {
        content: 'hello from primary',
        model: 'gpt-4',
        provider: 'openai',
        finishReason: 'stop',
      };

      mockChatFn.mockResolvedValueOnce(expectedResponse);

      const response = await orchestrator.chat([{ role: 'user', content: 'hello' }]);

      expect(response).toEqual(expectedResponse);
      expect(mockChatFn).toHaveBeenCalledTimes(1);
    });

    it('nên tự động thử lại (retry) khi provider chính gặp lỗi tạm thời và sau đó thành công', async () => {
      const orchestrator = new Orchestrator(config);
      const expectedResponse: ChatResponse = {
        content: 'success after retry',
        model: 'gpt-4',
        provider: 'openai',
        finishReason: 'stop',
      };

      // Lần 1 ném ra lỗi, lần 2 trả về response thành công
      mockChatFn
        .mockRejectedValueOnce(new Error('API Rate Limit'))
        .mockResolvedValueOnce(expectedResponse);

      const response = await orchestrator.chat([{ role: 'user', content: 'hello' }]);

      expect(response).toEqual(expectedResponse);
      expect(mockChatFn).toHaveBeenCalledTimes(2);
    });

    it('nên tự động chuyển đổi sang provider dự phòng (Fallback/Failover) khi provider chính bị lỗi hoàn toàn', async () => {
      const orchestrator = new Orchestrator(config);
      const fallbackResponse: ChatResponse = {
        content: 'hello from fallback anthropic',
        model: 'claude-3',
        provider: 'anthropic',
        finishReason: 'stop',
      };

      // OpenAI (primary) lỗi hoàn toàn cả 2 lần retry
      // Anthropic (fallback) sẽ được gọi và trả về thành công
      mockChatFn
        .mockRejectedValueOnce(new Error('OpenAI Down 1')) // OpenAI trial 1
        .mockRejectedValueOnce(new Error('OpenAI Down 2')) // OpenAI trial 2 (retry)
        .mockResolvedValueOnce(fallbackResponse); // Anthropic (fallback)

      const response = await orchestrator.chat([{ role: 'user', content: 'hello' }]);

      expect(response).toEqual(fallbackResponse);
      expect(mockChatFn).toHaveBeenCalledTimes(3); // 2 OpenAI + 1 Anthropic
    });

    it('nên ném ra lỗi của provider chính nếu cả primary và fallback đều thất bại', async () => {
      const orchestrator = new Orchestrator(config);

      // Cả OpenAI và Anthropic đều bị lỗi
      mockChatFn
        .mockRejectedValueOnce(new Error('OpenAI Fatal Error')) // OpenAI trial 1
        .mockRejectedValueOnce(new Error('OpenAI Fatal Error')) // OpenAI trial 2
        .mockRejectedValueOnce(new Error('Anthropic Fatal Error')); // Anthropic fallback

      await expect(orchestrator.chat([{ role: 'user', content: 'hello' }])).rejects.toThrow(
        'OpenAI Fatal Error',
      ); // Trả về lỗi của primary provider
    });
  });

  describe('Cơ chế Fallback cho Chat Stream', () => {
    it('nên trả về các chunks từ primary provider nếu hoạt động bình thường', async () => {
      const orchestrator = new Orchestrator(config);
      const stream = orchestrator.chatStream([{ role: 'user', content: 'hello' }]);

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(2);
      expect(chunks[0]?.content).toBe('openai stream chunk');
      expect(chunks[0]?.provider).toBe('openai');
    });

    it('nên tự động chuyển đổi sang provider dự phòng khi stream của primary provider bị lỗi ngay từ đầu', async () => {
      const orchestrator = new Orchestrator(config);

      // Mock class OpenAI chatStream ném ra lỗi
      const openaiProvider = orchestrator.getRegistry().get('openai') as any;
      openaiProvider.chatStream = async function* () {
        throw new Error('OpenAI Stream failed');
      };

      const stream = orchestrator.chatStream([{ role: 'user', content: 'hello' }]);

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Anthropic (fallback) được gọi
      expect(chunks.length).toBe(2);
      expect(chunks[0]?.content).toBe('anthropic stream chunk');
      expect(chunks[0]?.provider).toBe('anthropic');
    });
  });
});
