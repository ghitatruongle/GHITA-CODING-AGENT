import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { sleep } from '@ghita/shared';

// Import Custom Errors
import {
  AIBudgetExceededError,
  AIValidationError,
} from '../../packages/ai-engine/src/errors/index.js';

// Import Caching System
import {
  InMemoryCache,
  RedisCache,
  SemanticCache,
} from '../../packages/ai-engine/src/utils/cache.js';

// Import Cost & Budget
import {
  CostTracker,
  BudgetManager,
  DEFAULT_PRICING_TABLE,
  getModelPricing,
} from '../../packages/ai-engine/src/utils/cost.js';

// Import Prompt System
import {
  PromptTemplate,
  ChatPromptTemplate,
  FewShotPromptTemplate,
  PipelinePromptTemplate,
  PromptManager,
} from '../../packages/ai-engine/src/utils/prompt.js';

// Import Middleware Pipeline
import {
  wrapLanguageModel,
  wrapEmbeddingModel,
  wrapImageModel,
  wrapProvider,
  composeMiddlewares,
} from '../../packages/ai-engine/src/utils/middleware.js';

// Import Universal Chat Model Router
import { UniversalChatModel } from '../../packages/ai-engine/src/utils/universal.js';
import { ProviderRegistry } from '../../packages/ai-engine/src/registry.js';

// Import Output Parsers
import {
  JSONOutputParser,
  XMLOutputParser,
  ListOutputParser,
  StructuredOutputParser,
} from '../../packages/ai-engine/src/utils/parsers.js';

// --- ioredis Mock ---
const mockRedisStorage = new Map<string, string>();
let mockRedisInstance: any = null;
let triggerRedisError = false;

vi.mock('ioredis', () => {
  class MockRedis {
    private events: Record<string, Function[]> = {};

    constructor() {
      mockRedisInstance = this;
      // Emit connect event
      setTimeout(() => {
        if (!triggerRedisError) {
          this.emit('connect');
        } else {
          this.emit('error', new Error('Connection refused'));
        }
      }, 5);
    }

    on(event: string, cb: Function) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(cb);
    }

    emit(event: string, ...args: any[]) {
      const listeners = this.events[event] || [];
      for (const cb of listeners) {
        cb(...args);
      }
    }

    async get(key: string) {
      if (triggerRedisError) throw new Error('Redis Error');
      return mockRedisStorage.get(key) || null;
    }

    async set(key: string, value: string, mode?: string, duration?: number) {
      if (triggerRedisError) throw new Error('Redis Error');
      mockRedisStorage.set(key, value);
    }

    async del(key: string) {
      if (triggerRedisError) throw new Error('Redis Error');
      mockRedisStorage.delete(key);
    }

    async flushdb() {
      if (triggerRedisError) throw new Error('Redis Error');
      mockRedisStorage.clear();
    }
  }

  return {
    default: MockRedis,
  };
});

describe('2 Core AI Engine Features Test Suite', () => {
  // ==============================================================================
  // 1. InMemoryCache (STT 2.1)
  // ==============================================================================
  describe('InMemoryCache (STT 2.1)', () => {
    let cache: InMemoryCache;

    beforeEach(() => {
      cache = new InMemoryCache();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set, get and delete cache values correctly', async () => {
      await cache.set('key1', { data: 'test' });
      expect(await cache.get('key1')).toEqual({ data: 'test' });

      await cache.delete('key1');
      expect(await cache.get('key1')).toBeNull();
    });

    it('should handle TTL expiry correctly', async () => {
      // TTL is 5 seconds
      await cache.set('key-ttl', 'expired-soon', 5);
      expect(await cache.get('key-ttl')).toBe('expired-soon');

      // Fast-forward 6 seconds
      vi.advanceTimersByTime(6000);
      expect(await cache.get('key-ttl')).toBeNull();
    });

    it('should clear all entries', async () => {
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.clear();
      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBeNull();
    });
  });

  // ==============================================================================
  // 2. RedisCache (STT 2.2)
  // ==============================================================================
  describe('RedisCache (STT 2.2)', () => {
    let cache: RedisCache;

    beforeEach(async () => {
      mockRedisStorage.clear();
      triggerRedisError = false;
      cache = new RedisCache();
      // Wait for mock redis client connection state to be ready
      for (let i = 0; i < 50; i++) {
        if ((cache as any).isConnected) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    });

    it('should write to Redis and read back successfully when connected', async () => {
      await cache.set('redis-key', { val: 42 });
      expect(mockRedisStorage.has('redis-key')).toBe(true);

      const res = await cache.get('redis-key');
      expect(res).toEqual({ val: 42 });
    });

    it('should delete and clear Redis correctly', async () => {
      await cache.set('k1', 'v1');
      await cache.delete('k1');
      expect(await cache.get('k1')).toBeNull();

      await cache.set('k2', 'v2');
      await cache.clear();
      expect(await cache.get('k2')).toBeNull();
    });

    it('should gracefully fallback to InMemoryCache if Redis errors/disconnects', async () => {
      // Simulate error triggers fallback
      triggerRedisError = true;
      if (mockRedisInstance) {
        mockRedisInstance.emit('error', new Error('Redis connection lost'));
      }

      await cache.set('fallback-key', 'in-memory-only');
      // Should not be in Redis storage due to fallback
      expect(mockRedisStorage.has('fallback-key')).toBe(false);

      // But should be successfully retrieved from InMemory fallback
      expect(await cache.get('fallback-key')).toBe('in-memory-only');
    });
  });

  // ==============================================================================
  // 3. SemanticCache (STT 2.3)
  // ==============================================================================
  describe('SemanticCache (STT 2.3)', () => {
    let mockEmbedder: any;
    let semanticCache: SemanticCache;
    let fetchSpy: any;

    beforeEach(() => {
      mockEmbedder = {
        embed: vi.fn().mockResolvedValue({ embedding: new Array(1536).fill(0.1) }),
      };

      // Mock global fetch
      fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('should fallback to InMemory when Qdrant collection does not exist and fails to initialize', async () => {
      fetchSpy.mockRejectedValue(new Error('Connection refused'));

      semanticCache = new SemanticCache(mockEmbedder, { threshold: 0.9, fallbackToInMemory: true });
      await new Promise((resolve) => setTimeout(resolve, 5)); // wait init

      // Test that get and set work via fallback cache
      await semanticCache.set('hello', 'world');
      expect(await semanticCache.get('hello')).toBe('world');
      expect(mockEmbedder.embed).not.toHaveBeenCalled();
    });

    it('should trigger Qdrant search and hit cache if similarity threshold is met', async () => {
      // Mock collection existence check as 200 OK
      fetchSpy.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : (url as any).url || String(url);

        if (urlStr.includes('/collections/semantic_cache') && init?.method === 'GET') {
          return Promise.resolve({
            status: 200,
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        if (urlStr.includes('/points/search') && init?.method === 'POST') {
          return Promise.resolve({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({
                result: [
                  {
                    score: 0.95, // >= 0.9 threshold
                    payload: {
                      key: 'test-key',
                      value: 'cached-value',
                      expiresAt: null,
                    },
                  },
                ],
              }),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      semanticCache = new SemanticCache(mockEmbedder, {
        threshold: 0.9,
        qdrantUrl: 'http://qdrant:6333',
      });
      await new Promise((resolve) => setTimeout(resolve, 5));

      const res = await semanticCache.get('test-key');
      expect(res).toBe('cached-value');
      expect(mockEmbedder.embed).toHaveBeenCalledWith('test-key');
    });

    it('should miss cache and returns null if similarity threshold is not met', async () => {
      fetchSpy.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : (url as any).url || String(url);
        if (urlStr.includes('/collections/semantic_cache') && init?.method === 'GET') {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({}) });
        }
        if (urlStr.includes('/points/search') && init?.method === 'POST') {
          return Promise.resolve({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({
                result: [
                  {
                    score: 0.85, // < 0.9 threshold
                    payload: { key: 'test-key', value: 'cached-value', expiresAt: null },
                  },
                ],
              }),
          });
        }
        return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({}) });
      });

      semanticCache = new SemanticCache(mockEmbedder, { threshold: 0.9 });
      await new Promise((resolve) => setTimeout(resolve, 5));

      const res = await semanticCache.get('test-key');
      expect(res).toBeNull();
    });

    it('should upsert point into Qdrant when set is called', async () => {
      let upsertPayload: any = null;

      fetchSpy.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : (url as any).url || String(url);
        if (urlStr.includes('/collections/semantic_cache') && init?.method === 'GET') {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({}) });
        }
        if (urlStr.includes('/points') && init?.method === 'PUT') {
          upsertPayload = JSON.parse(init.body as string);
          return Promise.resolve({
            status: 200,
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({}) });
      });

      semanticCache = new SemanticCache(mockEmbedder, { threshold: 0.9 });
      await new Promise((resolve) => setTimeout(resolve, 5));

      await semanticCache.set('sample-key', 'sample-val', 60);

      expect(mockEmbedder.embed).toHaveBeenCalledWith('sample-key');
      expect(upsertPayload).toBeDefined();
      expect(upsertPayload.points[0].payload.value).toBe('sample-val');
      expect(upsertPayload.points[0].payload.key).toBe('sample-key');
      expect(upsertPayload.points[0].payload.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  // ==============================================================================
  // 4. Cost Tracker & Budgeting (STT 2.4, 2.5)
  // ==============================================================================
  describe('Cost Tracker & Budgeting (STT 2.4, 2.5)', () => {
    describe('getModelPricing & Pricing Table Resolution', () => {
      it('should match exact model names from default pricing table', () => {
        const pricing = getModelPricing('gpt-4o');
        expect(pricing.inputCostPer1k).toBe(0.005);
        expect(pricing.outputCostPer1k).toBe(0.015);
      });

      it('should partially match model names intelligently', () => {
        const pricing = getModelPricing('my-awesome-gpt-4o-model');
        expect(pricing.inputCostPer1k).toBe(0.005);
      });

      it('should return fallback pricing for unknown models', () => {
        const pricing = getModelPricing('unknown-model-xyz');
        expect(pricing.inputCostPer1k).toBe(0.002); // FALLBACK_PRICING
        expect(pricing.outputCostPer1k).toBe(0.006);
      });
    });

    describe('CostTracker', () => {
      let tracker: CostTracker;

      beforeEach(() => {
        tracker = new CostTracker();
      });

      it('should calculate cost correctly', () => {
        // gpt-4o: input 0.005/1k, output 0.015/1k
        // 2000 input tokens = 2 * 0.005 = 0.01
        // 3000 output tokens = 3 * 0.015 = 0.045
        // total = 0.055
        const cost = tracker.calculateCost('gpt-4o', 2000, 3000);
        expect(cost).toBeCloseTo(0.055, 6);
      });

      it('should accumulate tracked costs and support reset', async () => {
        await tracker.trackCost('gpt-4o', 1000, 1000); // 0.005 + 0.015 = 0.02
        await tracker.trackCost('claude-3-5-sonnet', 2000, 2000); // sonnet: input 0.003/1k, output 0.015/1k -> 0.006 + 0.03 = 0.036

        expect(tracker.getTotalCost()).toBeCloseTo(0.056, 6);

        tracker.reset();
        expect(tracker.getTotalCost()).toBe(0);
      });
    });

    describe('BudgetManager', () => {
      it('should check budget successfully and throw error on breach', () => {
        const manager = new BudgetManager({ limit: 0.1, period: 'weekly' });

        manager.recordSpent(0.05);
        expect(manager.getCurrentSpent()).toBe(0.05);

        // Budget check within limit
        expect(() => manager.checkBudget(0.04)).not.toThrow();

        // Budget check exceeds limit
        expect(() => manager.checkBudget(0.06)).toThrow(AIBudgetExceededError);
      });

      it('should trigger alert callbacks at configured thresholds', () => {
        const alerts: Array<{ spent: number; pct: number }> = [];
        const manager = new BudgetManager({
          limit: 100,
          alertThresholds: [0.5, 0.8, 1.0],
          onAlert: (spent, limit, pct) => {
            alerts.push({ spent, pct });
          },
        });

        manager.recordSpent(40);
        expect(alerts).toHaveLength(0);

        manager.recordSpent(15); // Total 55 (55%), should trigger 50% threshold
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toEqual({ spent: 55, pct: 0.55 });

        // Triggering again in the same range shouldn't repeat alert
        manager.recordSpent(5);
        expect(alerts).toHaveLength(1);

        manager.recordSpent(25); // Total 85 (85%), should trigger 80% threshold
        expect(alerts).toHaveLength(2);
        expect(alerts[1].pct).toBe(0.85);
      });

      it('should adjust limits dynamically via setLimit', () => {
        const manager = new BudgetManager({ limit: 10 });
        expect(manager.getLimit()).toBe(10);

        manager.setLimit(20);
        expect(manager.getLimit()).toBe(20);
      });
    });
  });

  // ==============================================================================
  // 5. Prompt System (STT 2.6, 2.10)
  // ==============================================================================
  describe('Prompt System (STT 2.6, 2.10)', () => {
    describe('PromptTemplate', () => {
      it('should render both {{var}} and {var} template placeholders', () => {
        const t1 = new PromptTemplate('Hello {{name}}! Welcome to {topic}.');
        expect(t1.format({ name: 'Alice', topic: 'programming' })).toBe(
          'Hello Alice! Welcome to programming.',
        );
      });

      it('should keep unresolved variables as-is', () => {
        const t = new PromptTemplate('Hello {name} and {missing}!');
        expect(t.format({ name: 'Bob' })).toBe('Hello Bob and {missing}!');
      });
    });

    describe('ChatPromptTemplate', () => {
      it('should format role-based messages correctly', () => {
        const chatTemplate = new ChatPromptTemplate([
          { role: 'system', template: 'You are an assistant specialized in {{topic}}.' },
          { role: 'user', template: 'Help me with {task}' },
        ]);

        const messages = chatTemplate.formatMessages({ topic: 'Math', task: 'calculus' });
        expect(messages).toEqual([
          { role: 'system', content: 'You are an assistant specialized in Math.' },
          { role: 'user', content: 'Help me with calculus' },
        ]);
      });
    });

    describe('FewShotPromptTemplate', () => {
      it('should render few-shot prompt with separators correctly', () => {
        const examplePrompt = new PromptTemplate('Input: {input}\nOutput: {output}');
        const fewShot = new FewShotPromptTemplate({
          examples: [
            { input: '1+1', output: '2' },
            { input: '2+2', output: '4' },
          ],
          examplePrompt,
          prefix: 'Solve equations:',
          suffix: 'Input: {query}\nOutput:',
          inputVariables: ['query'],
          exampleSeparator: '\n---\n',
        });

        const output = fewShot.format({ query: '3+3' });
        expect(output).toBe(
          'Solve equations:\n---\nInput: 1+1\nOutput: 2\n---\nInput: 2+2\nOutput: 4\n---\nInput: 3+3\nOutput:',
        );
      });
    });

    describe('PipelinePromptTemplate', () => {
      it('should dynamically compose multiple sub-prompts into final prompt', () => {
        const finalPrompt = new PromptTemplate(
          'Instructions:\n{instructions}\n\nContext:\n{context}\n\nQuestion: {query}',
        );
        const instructionsPrompt = new PromptTemplate('Analyze the topic: {topic}.');
        const contextPrompt = new PromptTemplate('The user is logged in as {username}.');

        const pipeline = new PipelinePromptTemplate(finalPrompt, [
          { parameterName: 'instructions', prompt: instructionsPrompt },
          { parameterName: 'context', prompt: contextPrompt },
        ]);

        const rendered = pipeline.format({
          topic: 'Space',
          username: 'JohnDoe',
          query: 'What is Mars?',
        });

        expect(rendered).toBe(
          'Instructions:\nAnalyze the topic: Space.\n\nContext:\nThe user is logged in as JohnDoe.\n\nQuestion: What is Mars?',
        );
      });
    });

    describe('PromptManager', () => {
      let pm: PromptManager;

      beforeEach(() => {
        pm = new PromptManager();
      });

      it('should register and retrieve templates with version control', () => {
        const tV1 = new PromptTemplate('Hello {{name}} v1');
        const tV2 = new PromptTemplate('Hello {{name}} v2');

        pm.register('greet', tV1, 'v1');
        pm.register('greet', tV2, 'v2');

        expect(pm.get('greet', 'v1')).toBe(tV1);
        expect(pm.get('greet', 'v2')).toBe(tV2);

        // First registration sets latest fallback, which is tV1
        expect(pm.get('greet', 'latest')).toBe(tV1);

        // Explicitly registering as latest updates it
        pm.register('greet', tV2, 'latest');
        expect(pm.get('greet', 'latest')).toBe(tV2);
      });

      it('should delete specific or all versions of templates', () => {
        const t1 = new PromptTemplate('v1');
        const t2 = new PromptTemplate('v2');
        pm.register('greet', t1, 'v1');
        pm.register('greet', t2, 'v2');

        // Deleting v1 makes it fallback to latest (which is t1)
        pm.delete('greet', 'v1');
        expect(pm.get('greet', 'v1')).toBe(t1);

        // Deleting latest too makes it throw
        pm.delete('greet', 'latest');
        expect(() => pm.get('greet', 'v1')).toThrow();

        expect(pm.get('greet', 'v2')).toBe(t2);

        // Delete all
        pm.delete('greet');
        expect(() => pm.get('greet', 'v2')).toThrow();
      });
    });
  });

  // ==============================================================================
  // 6. Middleware Extensions (STT 2.7, 2.8)
  // ==============================================================================
  describe('Middleware Extensions (STT 2.7, 2.8)', () => {
    let mockProvider: any;

    beforeEach(() => {
      mockProvider = {
        type: 'custom',
        name: 'MockProvider',
        defaultModel: 'm1',
        models: ['m1'],
        isReady: async () => true,
        test: async () => true,
        chat: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'Base response' },
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        }),
        chatStream: async function* () {
          yield { index: 0, delta: 'Base stream response' };
        },
        embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
        embedMany: vi.fn().mockResolvedValue({
          embeddings: [
            [0.1, 0.2],
            [0.3, 0.4],
          ],
        }),
      };
    });

    it('should flow chat calls through wrapped middleware chains in correct sequence', async () => {
      const logs: string[] = [];

      const mw1 = async (params: any, next: any) => {
        logs.push('mw1 start');
        params.messages.push({ role: 'user', content: 'appended by mw1' });
        const res = await next();
        logs.push('mw1 end');
        return res;
      };

      const mw2 = async (params: any, next: any) => {
        logs.push('mw2 start');
        const res = await next();
        res.message.content += ' modified by mw2';
        logs.push('mw2 end');
        return res;
      };

      const wrapped = wrapLanguageModel(mockProvider, {
        chat: [mw1, mw2],
        chatStream: [],
      });

      const res = await wrapped.chat([{ role: 'user', content: 'hello' }]);

      expect(logs).toEqual(['mw1 start', 'mw2 start', 'mw2 end', 'mw1 end']);
      expect(mockProvider.chat).toHaveBeenCalled();
      expect(res.message.content).toBe('Base response modified by mw2');
    });

    it('should wrap embedding methods with middleware', async () => {
      const mw: any = async (params: any, next: any) => {
        const res = await next(params.text + ' processed');
        res.embedding = res.embedding.map((x: number) => x * 10);
        return res;
      };

      const wrapped = wrapEmbeddingModel(mockProvider, {
        embed: [mw],
      });

      const res = await wrapped.embed('input');
      expect(mockProvider.embed).toHaveBeenCalledWith('input processed', undefined);
      expect(res.embedding).toEqual([1, 2]);
    });

    it('should wrap image models with generateImage middleware', async () => {
      const mockImageModel = {
        generateImage: vi.fn().mockResolvedValue({ url: 'http://base.url' }),
      };

      const mw: any = async (params: any, next: any) => {
        const res = await next(params.prompt + ' high quality');
        res.url += '/hd';
        return res;
      };

      const wrapped = wrapImageModel(mockImageModel, [mw]);
      const res = await wrapped.generateImage('cat');

      expect(mockImageModel.generateImage).toHaveBeenCalledWith('cat high quality', undefined);
      expect(res.url).toBe('http://base.url/hd');
    });

    it('should apply wrapProvider to cover all aspects at once', async () => {
      const wrapped = wrapProvider(mockProvider, {
        chat: [async (p, next) => next()],
        embed: [async (p, next) => next()],
      });

      const chatRes = await wrapped.chat([]);
      const embedRes = await wrapped.embed('text');

      expect(chatRes).toBeDefined();
      expect(embedRes).toBeDefined();
    });
  });

  // ==============================================================================
  // 7. Universal Chat Model Router (STT 2.9)
  // ==============================================================================
  describe('Universal Chat Model Router (STT 2.9)', () => {
    let registry: ProviderRegistry;
    let mockOpenAI: any;
    let mockAnthropic: any;

    beforeEach(() => {
      registry = new ProviderRegistry();

      mockOpenAI = {
        type: 'openai',
        name: 'OpenAI',
        defaultModel: 'gpt-4o',
        models: ['gpt-4o', 'gpt-3.5-turbo'],
        isReady: async () => true,
        test: async () => true,
        chat: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'OpenAI response' },
        }),
      };

      mockAnthropic = {
        type: 'anthropic',
        name: 'Anthropic',
        defaultModel: 'claude-3-5-sonnet',
        models: ['claude-3-5-sonnet'],
        isReady: async () => true,
        test: async () => true,
        chat: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'Anthropic response' },
        }),
      };

      registry.register(mockOpenAI);
      registry.register(mockAnthropic);
    });

    it('should resolve and call OpenAI provider for prefix-mapped option openai/gpt-4o', async () => {
      const router = new UniversalChatModel({ registry });
      const res = await router.chat([{ role: 'user', content: 'hello' }], {
        model: 'openai/gpt-4o',
      });

      expect(res.message.content).toBe('OpenAI response');
      // The prefix "openai/" must be stripped when forwarding to mockOpenAI
      expect(mockOpenAI.chat).toHaveBeenCalledWith(
        [{ role: 'user', content: 'hello' }],
        expect.objectContaining({ model: 'gpt-4o' }),
      );
    });

    it('should resolve provider intelligently based on model keywords without slashes', async () => {
      const router = new UniversalChatModel({ registry });
      const res = await router.chat([], { model: 'claude-3-5-sonnet' });

      expect(res.message.content).toBe('Anthropic response');
      expect(mockAnthropic.chat).toHaveBeenCalled();
    });

    it('should route requests based on agentRole configurations', async () => {
      const router = new UniversalChatModel({
        registry,
        routing: {
          coder: 'openai',
          researcher: 'anthropic',
        },
      });

      const res1 = await router.chat([], { agentRole: 'coder' });
      expect(res1.message.content).toBe('OpenAI response');

      const res2 = await router.chat([], { agentRole: 'researcher' });
      expect(res2.message.content).toBe('Anthropic response');
    });

    it('should retry and fallback to another provider on primary failure', async () => {
      // Make OpenAI fail
      mockOpenAI.chat.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const router = new UniversalChatModel({
        registry,
        defaultProvider: 'openai',
        fallbackOrder: ['anthropic'],
        retryAttempts: 1, // Only 1 attempt before falling back
      });

      const res = await router.chat([]);
      expect(res.message.content).toBe('Anthropic response');
      expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
      expect(mockAnthropic.chat).toHaveBeenCalledTimes(1);
    });
  });

  // ==============================================================================
  // 8. Output Parsers (STT 2.11)
  // ==============================================================================
  describe('Output Parsers (STT 2.11)', () => {
    describe('JSONOutputParser', () => {
      it('should parse markdown JSON blocks correctly', () => {
        const parser = new JSONOutputParser();
        const text =
          'Here is the results:\n```json\n{"status": "ok", "value": 100}\n```\nHope it helps!';
        expect(parser.parse(text)).toEqual({ status: 'ok', value: 100 });
      });

      it('should throw error when JSON is missing or invalid', () => {
        const parser = new JSONOutputParser();
        expect(() => parser.parse('')).toThrow('No JSON block found in response');
        expect(() => parser.parse('No json here!')).toThrow(/Failed to parse JSON/);
        expect(() => parser.parse('```json\n{"unclosed": }\n```')).toThrow(/Failed to parse JSON/);
      });
    });

    describe('XMLOutputParser', () => {
      it('should extract key-values from XML tags', () => {
        const parser = new XMLOutputParser();
        const text = '<thought>\nThinking hard...\n</thought>\n<response>Final answer</response>';
        expect(parser.parse(text)).toEqual({
          thought: 'Thinking hard...',
          response: 'Final answer',
        });
      });
    });

    describe('ListOutputParser', () => {
      it('should parse bullet points or numbered lists', () => {
        const parser = new ListOutputParser();
        const text = '- Apples\n* Oranges\n1. Bananas\nJust a normal line\nPlums, Peaches';

        expect(parser.parse(text)).toEqual([
          'Apples',
          'Oranges',
          'Bananas',
          'Just a normal line',
          'Plums',
          'Peaches',
        ]);
      });
    });

    describe('StructuredOutputParser', () => {
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      it('should parse and validate using Zod successfully', () => {
        const parser = StructuredOutputParser.fromZodSchema(userSchema);
        const text = '```json\n{"name": "Alice", "age": 30}\n```';
        expect(parser.parse(text)).toEqual({ name: 'Alice', age: 30 });
      });

      it('should throw AIValidationError on Zod validation failure', () => {
        const parser = StructuredOutputParser.fromZodSchema(userSchema);
        const text = '```json\n{"name": "Alice", "age": "thirty"}\n```';

        expect(() => parser.parse(text)).toThrow(AIValidationError);
      });
    });
  });
});
