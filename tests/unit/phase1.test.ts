import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { sleep } from '@ghita/shared';

// Import Custom Errors
import {
  AIBaseError,
  AIAPIError,
  AIValidationError,
  AITimeoutError,
  AIRateLimitError,
  AIInvalidConfigError,
  AINoProviderError,
  AIToolCallRepairError,
  AIPermissionDeniedError,
  AISecurityGuardrailError,
  AIUnsupportedFeatureError,
} from '../../packages/ai-engine/src/errors/index.js';

// Import Structured Utilities
import {
  zodToJsonSchema,
  extractJsonFromText,
  generateObject,
} from '../../packages/ai-engine/src/utils/structured.js';

// Import Tool Call Repair
import { chatWithToolCallRepair } from '../../packages/ai-engine/src/utils/repair.js';

// Import Permissions
import { PermissionManager } from '../../packages/ai-engine/src/security/permissions.js';

// Import Smooth Streaming & Token Calculator
import {
  smoothStream,
  ChunkDetector,
  TokenCalculator,
} from '../../packages/ai-engine/src/utils/streaming.js';

// Import Reasoning
import {
  extractReasoning,
  ReasoningStreamExtractor,
} from '../../packages/ai-engine/src/utils/reasoning.js';

// Import Middleware
import {
  wrapLanguageModel,
  composeMiddlewares,
} from '../../packages/ai-engine/src/utils/middleware.js';

// Import Orchestrator & Types for mock setup
import { Orchestrator } from '../../packages/ai-engine/src/orchestrator.js';
import type { AIProvider, ChatMessage, ChatResponse, OrchestratorConfig } from '../../packages/ai-engine/src/types.js';

describe('Phase 1 Core AI Engine Features Test Suite', () => {

  // ==============================================================================
  // 1. Custom Error Hierarchy (STT 1.6)
  // ==============================================================================
  describe('Custom Error Hierarchy (STT 1.6)', () => {
    it('should correctly construct and verify properties for AIBaseError', () => {
      const causeError = new Error('Original Cause');
      const err = new AIBaseError('Something went wrong', causeError);

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AIBaseError);
      expect(err.name).toBe('AIBaseError');
      expect(err.message).toBe('Something went wrong');
      expect(err.cause).toBe(causeError);
    });

    it('should map proper parameters for AIAPIError', () => {
      const err = new AIAPIError('OpenAI', 'Failed request', 402, { raw: 'body' });
      expect(err).toBeInstanceOf(AIBaseError);
      expect(err.provider).toBe('OpenAI');
      expect(err.status).toBe(402);
      expect(err.details).toEqual({ raw: 'body' });
      expect(err.message).toContain('[OpenAI API Error]');
    });

    it('should map proper parameters for AIValidationError', () => {
      const err = new AIValidationError('my-schema', '{"invalid": true}', [{ path: ['name'], message: 'Required' }]);
      expect(err).toBeInstanceOf(AIBaseError);
      expect(err.schemaDescription).toBe('my-schema');
      expect(err.rawResponse).toBe('{"invalid": true}');
      expect(err.errors).toHaveLength(1);
    });

    it('should map proper parameters for AITimeoutError', () => {
      const err = new AITimeoutError(5000);
      expect(err).toBeInstanceOf(AIBaseError);
      expect(err.timeoutMs).toBe(5000);
      expect(err.message).toContain('timed out after 5000ms');
    });

    it('should map proper parameters for AIRateLimitError', () => {
      const reset = new Date();
      const err = new AIRateLimitError('Anthropic', 'Too many requests', 100, 0, reset);
      expect(err).toBeInstanceOf(AIBaseError);
      expect(err.provider).toBe('Anthropic');
      expect(err.limit).toBe(100);
      expect(err.remaining).toBe(0);
      expect(err.resetTime).toBe(reset);
    });

    it('should map proper parameters for AIToolCallRepairError', () => {
      const err = new AIToolCallRepairError('{"tool": "args"}', 3, ['error1', 'error2']);
      expect(err).toBeInstanceOf(AIBaseError);
      expect(err.rawResponse).toBe('{"tool": "args"}');
      expect(err.attempts).toBe(3);
      expect(err.toolErrors).toEqual(['error1', 'error2']);
    });

    it('should map proper parameters for AIPermissionDeniedError', () => {
      const err = new AIPermissionDeniedError('write_file', 'Destructive operation inside root');
      expect(err).toBeInstanceOf(AIBaseError);
      expect(err.toolName).toBe('write_file');
      expect(err.reason).toBe('Destructive operation inside root');
    });

    it('should map proper parameters for AISecurityGuardrailError', () => {
      const err = new AISecurityGuardrailError('prompt_injection', { detectedPattern: 'ignore instructions' });
      expect(err).toBeInstanceOf(AIBaseError);
      expect(err.threatType).toBe('prompt_injection');
      expect(err.details).toEqual({ detectedPattern: 'ignore instructions' });
    });

    it('should map proper parameters for AIUnsupportedFeatureError', () => {
      const err = new AIUnsupportedFeatureError('Anthropic', 'embed');
      expect(err).toBeInstanceOf(AIBaseError);
      expect(err.provider).toBe('Anthropic');
      expect(err.feature).toBe('embed');
    });
  });

  // ==============================================================================
  // 2. Structured Output (STT 1.1)
  // ==============================================================================
  describe('Structured Output (STT 1.1)', () => {
    describe('zodToJsonSchema converter', () => {
      it('should convert primitive types', () => {
        expect(zodToJsonSchema(z.string())).toEqual({ type: 'string' });
        expect(zodToJsonSchema(z.number())).toEqual({ type: 'number' });
        expect(zodToJsonSchema(z.boolean())).toEqual({ type: 'boolean' });
      });

      it('should convert enums and arrays', () => {
        const enumSchema = z.enum(['read', 'write', 'admin']);
        expect(zodToJsonSchema(enumSchema)).toEqual({
          type: 'string',
          enum: ['read', 'write', 'admin'],
        });

        const arraySchema = z.array(z.string());
        expect(zodToJsonSchema(arraySchema)).toEqual({
          type: 'array',
          items: { type: 'string' },
        });
      });

      it('should convert optionals, nullables, unions, and effects', () => {
        expect(zodToJsonSchema(z.string().optional())).toEqual({ type: 'string' });
        expect(zodToJsonSchema(z.string().nullable())).toEqual({ type: 'string' });

        const unionSchema = z.union([z.string(), z.number()]);
        expect(zodToJsonSchema(unionSchema)).toEqual({
          anyOf: [{ type: 'string' }, { type: 'number' }],
        });

        const effectSchema = z.string().refine((val) => val.length > 0);
        expect(zodToJsonSchema(effectSchema)).toEqual({ type: 'string' });
      });

      it('should convert objects recursively and extract required properties', () => {
        const userSchema = z.object({
          id: z.number(),
          name: z.string(),
          email: z.string().optional(),
          tags: z.array(z.string()),
        });

        expect(zodToJsonSchema(userSchema)).toEqual({
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
            email: { type: 'string' },
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['id', 'name', 'tags'],
        });
      });
    });

    describe('extractJsonFromText', () => {
      it('should extract JSON from markdown wraps', () => {
        expect(extractJsonFromText('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
        expect(extractJsonFromText('```\n[1, 2, 3]\n```')).toBe('[1, 2, 3]');
      });

      it('should extract first nested JSON object or array from conversational text', () => {
        expect(extractJsonFromText('Here is the data: {"id": 10} hope this helps!')).toBe('{"id": 10}');
        expect(extractJsonFromText('Values: [10, 20] end')).toBe('[10, 20]');
      });

      it('should return trimmed raw text if no JSON patterns match', () => {
        expect(extractJsonFromText('just simple text')).toBe('just simple text');
      });
    });

    describe('generateObject validation', () => {
      let mockOrchestrator: any;

      beforeEach(() => {
        mockOrchestrator = {
          chat: vi.fn(),
        };
      });

      it('should successfully parse valid generated JSON objects', async () => {
        const schema = z.object({
          success: z.boolean(),
          message: z.string(),
        });

        mockOrchestrator.chat.mockResolvedValueOnce({
          content: 'Sure! Here is the JSON: ```json\n{"success": true, "message": "Worked!"}\n```',
        });

        const result = await generateObject(mockOrchestrator, schema, [
          { role: 'user', content: 'Do something' },
        ]);

        expect(result.object).toEqual({ success: true, message: 'Worked!' });
        expect(result.rawResponse).toContain('Worked!');
        expect(mockOrchestrator.chat).toHaveBeenCalledTimes(1);

        // Check if schema description was added to system message
        const calledMessages = mockOrchestrator.chat.mock.calls[0][0];
        const systemMessage = calledMessages.find((m: any) => m.role === 'system');
        expect(systemMessage).toBeDefined();
        expect(systemMessage.content).toContain('"type": "object"');
      });

      it('should throw AIValidationError on malformed JSON', async () => {
        const schema = z.object({ value: z.number() });
        mockOrchestrator.chat.mockResolvedValueOnce({ content: 'Invalid JSON: { value: 10' });

        await expect(
          generateObject(mockOrchestrator, schema, [{ role: 'user', content: 'test' }])
        ).rejects.toThrow(AIValidationError);
      });

      it('should throw AIValidationError when schema does not match', async () => {
        const schema = z.object({ value: z.number() });
        mockOrchestrator.chat.mockResolvedValueOnce({ content: '{"value": "not-a-number"}' });

        await expect(
          generateObject(mockOrchestrator, schema, [{ role: 'user', content: 'test' }])
        ).rejects.toThrow(AIValidationError);
      });
    });
  });

  // ==============================================================================
  // 3. Tool Call Repair (STT 1.2)
  // ==============================================================================
  describe('Tool Call Repair (STT 1.2)', () => {
    let mockOrchestrator: any;
    let parseFn: any;

    beforeEach(() => {
      mockOrchestrator = {
        chat: vi.fn(),
      };
      parseFn = vi.fn();
    });

    it('should return successfully on first try when parse succeeds', async () => {
      mockOrchestrator.chat.mockResolvedValueOnce({ content: 'valid output' });
      parseFn.mockReturnValueOnce({ parsed: true });

      const result = await chatWithToolCallRepair(mockOrchestrator, [], parseFn);
      expect(result.parsed).toEqual({ parsed: true });
      expect(result.response.content).toBe('valid output');
      expect(mockOrchestrator.chat).toHaveBeenCalledTimes(1);
    });

    it('should retry when parse fails and return successfully once repaired', async () => {
      mockOrchestrator.chat
        .mockResolvedValueOnce({ content: 'invalid format' }) // Try 1
        .mockResolvedValueOnce({ content: 'corrected format' }); // Try 2

      parseFn
        .mockImplementationOnce(() => {
          throw new Error('Invalid brace placement');
        }) // Try 1 fails
        .mockReturnValueOnce({ parsed: true }); // Try 2 succeeds

      const result = await chatWithToolCallRepair(mockOrchestrator, [{ role: 'user', content: 'run tool' }], parseFn, {
        maxRetries: 2,
      });

      expect(result.parsed).toEqual({ parsed: true });
      expect(mockOrchestrator.chat).toHaveBeenCalledTimes(2);

      // Verify the history growth: original user msg + invalid assistant response + user corrective instructions
      const finalCallMessages = mockOrchestrator.chat.mock.calls[1][0] as ChatMessage[];
      expect(finalCallMessages).toHaveLength(3);
      expect(finalCallMessages[0]?.content).toBe('run tool');
      expect(finalCallMessages[1]?.role).toBe('assistant');
      expect(finalCallMessages[1]?.content).toBe('invalid format');
      expect(finalCallMessages[2]?.role).toBe('user');
      expect(finalCallMessages[2]?.content).toContain('Invalid brace placement');
    });

    it('should throw AIToolCallRepairError after max retries are exceeded', async () => {
      mockOrchestrator.chat.mockResolvedValue({ content: 'still invalid' });
      parseFn.mockImplementation(() => {
        throw new Error('JSON format error');
      });

      await expect(
        chatWithToolCallRepair(mockOrchestrator, [], parseFn, { maxRetries: 2 })
      ).rejects.toThrow(AIToolCallRepairError);

      expect(mockOrchestrator.chat).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  // ==============================================================================
  // 4. Context-Injected Permissions & Active Filter (STT 1.3)
  // ==============================================================================
  describe('Permissions Context & Active Filter (STT 1.3)', () => {
    let permissionManager: PermissionManager;

    beforeEach(() => {
      permissionManager = new PermissionManager();
    });

    it('should load default tool permissions correctly', () => {
      expect(permissionManager.getLevel('read_file')).toBe('read_only');
      expect(permissionManager.isAutoApprove('read_file')).toBe(true);
      expect(permissionManager.getLevel('write_file')).toBe('write');
      expect(permissionManager.isAutoApprove('write_file')).toBe(false);
      expect(permissionManager.isDestructive('delete_file')).toBe(true);
    });

    it('should support dynamic rule registration and evaluate with context', () => {
      // Rule: Auto approve writing inside a specific allowed workspace
      permissionManager.registerRule((toolName, context) => {
        if (toolName === 'write_file' && context?.filePath?.startsWith('d:\\allowed-project\\')) {
          return { level: 'write', autoApprove: true };
        }
        return undefined;
      });

      // Context 1: inside allowed path
      const check1 = permissionManager.checkPermission('write_file', { filePath: 'd:\\allowed-project\\index.js' });
      expect(check1.level).toBe('write');
      expect(check1.autoApprove).toBe(true);

      // Context 2: outside allowed path
      const check2 = permissionManager.checkPermission('write_file', { filePath: 'd:\\secret-path\\index.js' });
      expect(check2.level).toBe('write');
      expect(check2.autoApprove).toBe(false);
    });

    it('should step filter active tools correctly', () => {
      // By default all tools are returned
      const allActive = permissionManager.filterActiveTools(1);
      expect(allActive.length).toBeGreaterThan(5);

      // Register step restrictions
      permissionManager.registerStepFilter(2, ['read_file', 'grep']);
      const restricted = permissionManager.filterActiveTools(2);
      expect(restricted).toEqual(['read_file', 'grep']);

      // Unregistered steps fall back to all tools
      const otherStep = permissionManager.filterActiveTools(99);
      expect(otherStep).toEqual(allActive);
    });
  });

  // ==============================================================================
  // 5. Smooth Streaming & Token Calculator (STT 1.4)
  // ==============================================================================
  describe('Smooth Streaming & Token Calculator (STT 1.4)', () => {
    describe('smoothStream pacing helper', () => {
      it('should yield stream chunks correctly paced', async () => {
        async function* mockStream() {
          yield { content: 'Hello', done: false, provider: 'openai' };
          yield { content: ' World!', done: false, provider: 'openai' };
          yield { content: '', done: true, provider: 'openai' };
        }

        const smooth = smoothStream(mockStream(), { delayMs: 1, chunkSize: 2 });
        const outputs: string[] = [];

        for await (const chunk of smooth) {
          if (chunk.content) {
            outputs.push(chunk.content);
          }
        }

        // 'Hello' split by chunkSize 2 -> 'He', 'll', 'o'
        // ' World!' split by chunkSize 2 -> ' W', 'or', 'ld', '!'
        expect(outputs).toEqual(['He', 'll', 'o', ' W', 'or', 'ld', '!']);
      });
    });

    describe('ChunkDetector analytics', () => {
      it('should calculate stream performance and metrics accurately', () => {
        const detector = new ChunkDetector();
        detector.recordChunk({ content: 'abc', text: 'abc', done: false, provider: 'mock' });
        detector.recordChunk({ content: 'defg', text: 'defg', done: false, provider: 'mock' });

        const metrics = detector.getMetrics();
        expect(metrics.totalChunks).toBe(2);
        expect(metrics.averageChunkSize).toBe(3.5); // (3 + 4) / 2
        expect(metrics.chunksPerSecond).toBeGreaterThanOrEqual(0);
      });
    });

    describe('TokenCalculator', () => {
      it('should estimate token size of strings via character/word heuristics', () => {
        expect(TokenCalculator.estimateStringTokens('')).toBe(0);
        // "Hello World" -> 11 chars / 3.8 = 3. 2 words * 1.3 = 3. Max = 3
        expect(TokenCalculator.estimateStringTokens('Hello World')).toBe(3);
        expect(TokenCalculator.estimateStringTokens('This is a longer sentence for token estimation testing.')).toBe(15);
      });

      it('should estimate token size of message arrays with conversation overhead', () => {
        const messages: ChatMessage[] = [
          { role: 'system', content: 'system-prompt' },
          { role: 'user', content: 'hello' },
        ];
        const estimate = TokenCalculator.estimateMessagesTokens(messages);
        expect(estimate).toBeGreaterThan(10);
      });

      it('should dynamically track metrics in real time during streaming sessions', async () => {
        const calculator = new TokenCalculator();
        calculator.startStream();
        await sleep(10);

        calculator.recordStreamToken('hello streaming world');
        const metrics = calculator.getStreamMetrics();

        expect(metrics.estimatedTokens).toBeGreaterThan(0);
        expect(metrics.elapsedMs).toBeGreaterThanOrEqual(10);
        expect(metrics.tokensPerSecond).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ==============================================================================
  // 6. Reasoning & Thinking Extraction (STT 1.5)
  // ==============================================================================
  describe('Reasoning Extraction (STT 1.5)', () => {
    describe('Static extractReasoning parser', () => {
      it('should statically separate think tags from response content', () => {
        const text = 'Before <think>Thinking hard</think> After';
        const parsed = extractReasoning(text);
        expect(parsed.content).toBe('Before  After');
        expect(parsed.reasoning).toBe('Thinking hard');
      });

      it('should join multiple thinking blocks', () => {
        const text = '<think>block 1</think> intermediate <think>block 2</think> final';
        const parsed = extractReasoning(text);
        expect(parsed.content).toBe('intermediate  final');
        expect(parsed.reasoning).toBe('block 1\n\nblock 2');
      });

      it('should elegantly handle unclosed thinking blocks at end of text', () => {
        const text = 'Response start <think>Cut off mid thought';
        const parsed = extractReasoning(text);
        expect(parsed.content).toBe('Response start');
        expect(parsed.reasoning).toBe('Cut off mid thought');
      });

      it('should return empty if text is empty', () => {
        const parsed = extractReasoning('');
        expect(parsed.content).toBe('');
        expect(parsed.reasoning).toBe('');
      });
    });

    describe('Stateful ReasoningStreamExtractor parser', () => {
      it('should extract thinking blocks across multiple chunk streams', () => {
        const extractor = new ReasoningStreamExtractor();

        // 1. Regular content chunk
        const r1 = extractor.processChunk('Standard content. ');
        expect(r1.contentSlice).toBe('Standard content. ');
        expect(r1.reasoningSlice).toBe('');
        expect(r1.isThinking).toBe(false);

        // 2. Partial tag '<thi' chunk (should be buffered and NOT flushed as content)
        const r2 = extractor.processChunk('<thi');
        expect(r2.contentSlice).toBe('');
        expect(r2.reasoningSlice).toBe('');
        expect(r2.isThinking).toBe(false);

        // 3. Completing the think tag and starting reasoning
        const r3 = extractor.processChunk('nk>Reasoning starts. ');
        expect(r3.contentSlice).toBe('');
        expect(r3.reasoningSlice).toBe('Reasoning starts. ');
        expect(r3.isThinking).toBe(true);

        // 4. Continued reasoning
        const r4 = extractor.processChunk('Still thinking. ');
        expect(r4.contentSlice).toBe('');
        expect(r4.reasoningSlice).toBe('Still thinking. ');
        expect(r4.isThinking).toBe(true);

        // 5. Partial close tag '</thi'
        const r5 = extractor.processChunk('</thi');
        expect(r5.contentSlice).toBe('');
        expect(r5.reasoningSlice).toBe('');
        expect(r5.isThinking).toBe(true);

        // 6. Completing close tag and getting new content
        const r6 = extractor.processChunk('nk>Final content.');
        expect(r6.contentSlice).toBe('Final content.');
        expect(r6.reasoningSlice).toBe('');
        expect(r6.isThinking).toBe(false);
      });

      it('should flush remaining buffers correctly', () => {
        const extractor = new ReasoningStreamExtractor();
        extractor.processChunk('Start <think>Thinking</thi');
        const flushed = extractor.flush();
        expect(flushed.reasoningSlice).toBe('</thi');
      });
    });
  });

  // ==============================================================================
  // 7. Embeddings Support (STT 1.7)
  // ==============================================================================
  describe('Embeddings Support (STT 1.7)', () => {
    let orchestrator: Orchestrator;
    let mockProvider: any;

    beforeEach(() => {
      mockProvider = {
        type: 'openai',
        name: 'OpenAI',
        isReady: async () => true,
        chat: vi.fn(),
        chatStream: vi.fn(),
        embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2], model: 'text-emb', provider: 'openai' }),
        embedMany: vi.fn().mockResolvedValue({ embeddings: [[0.1, 0.2]], model: 'text-emb', provider: 'openai' }),
      };

      const config: OrchestratorConfig = {
        providers: [
          { type: 'openai', name: 'OpenAI', apiKey: 'test-key' }
        ],
        defaultProvider: 'openai',
      };

      orchestrator = new Orchestrator(config);
      // Inject mock provider into registry
      (orchestrator as any).registry.register(mockProvider);
    });

    it('should expose unified orchestrator.embed and call active provider', async () => {
      const result = await orchestrator.embed('text-to-embed');
      expect(result.embedding).toEqual([0.1, 0.2]);
      expect(mockProvider.embed).toHaveBeenCalledWith('text-to-embed', undefined);
    });

    it('should expose unified orchestrator.embedMany and call active provider', async () => {
      const result = await orchestrator.embedMany(['text-1', 'text-2']);
      expect(result.embeddings).toEqual([[0.1, 0.2]]);
      expect(mockProvider.embedMany).toHaveBeenCalledWith(['text-1', 'text-2'], undefined);
    });

    it('should trigger fallback support for embedding failures', async () => {
      const backupProvider = {
        type: 'google',
        name: 'Google',
        isReady: async () => true,
        embed: vi.fn().mockResolvedValue({ embedding: [0.9, 0.9], model: 'google-emb', provider: 'google' }),
      };
      (orchestrator as any).registry.register(backupProvider as any);
      orchestrator.setFallbackOrder(['google']);

      // Primary fails
      mockProvider.embed.mockRejectedValue(new Error('OpenAI quota exceeded'));

      const result = await orchestrator.embed('hello');
      expect(result.embedding).toEqual([0.9, 0.9]);
      expect(result.provider).toBe('google');
      expect(backupProvider.embed).toHaveBeenCalledTimes(1);
    });
  });

  // ==============================================================================
  // 8. Middleware Pipeline (STT 1.8)
  // ==============================================================================
  describe('Middleware Pipeline (STT 1.8)', () => {
    let mockProvider: AIProvider;
    const initialResponse: ChatResponse = {
      content: 'Original provider response',
      model: 'gpt-4o',
      provider: 'openai',
      finishReason: 'stop',
    };

    beforeEach(() => {
      mockProvider = {
        type: 'openai',
        name: 'OpenAI',
        defaultModel: 'gpt-4o',
        models: ['gpt-4o'],
        isReady: async () => true,
        test: async () => true,
        embed: async () => ({ embedding: [1, 2], model: 'gpt-4o', provider: 'openai' }),
        embedMany: async () => ({ embeddings: [[1, 2]], model: 'gpt-4o', provider: 'openai' }),
        chat: vi.fn().mockResolvedValue(initialResponse),
        chatStream: async function* () {
          yield { content: 'chunk1', done: false, provider: 'openai' };
          yield { content: 'chunk2', done: false, provider: 'openai' };
          yield { content: '', done: true, provider: 'openai' };
        },
      };
    });

    describe('composeMiddlewares helper', () => {
      it('should chain and compose sync/async functions', async () => {
        const middlewares = [
          async (params: any, next: any) => {
            params.val += 1;
            const res = await next(params);
            res.out += ' -> first';
            return res;
          },
          async (params: any, next: any) => {
            params.val *= 2;
            const res = await next(params);
            res.out += ' -> second';
            return res;
          },
        ];

        const base = async (params: any) => {
          return { out: `base(${params.val})` };
        };

        const pipeline = composeMiddlewares(middlewares, base);
        const result = await pipeline({ val: 5 });

        // Operations sequence:
        // params: val = 5 + 1 = 6
        // params: val = 6 * 2 = 12
        // base returns: { out: 'base(12)' }
        // second decorates: { out: 'base(12) -> second' }
        // first decorates: { out: 'base(12) -> second -> first' }
        expect(result).toEqual({ out: 'base(12) -> second -> first' });
      });
    });

    describe('wrapLanguageModel', () => {
      it('should intercept and decorate chat requests/responses', async () => {
        // Chat middleware to add a prefix and append content
        const chatMW1 = async (params: any, next: any) => {
          params.messages.push({ role: 'system', content: 'MW Inject' });
          const res = await next(params.messages, params.options);
          res.content = '[MW1] ' + res.content;
          return res;
        };

        const wrapped = wrapLanguageModel(mockProvider, {
          chat: [chatMW1],
          chatStream: [],
        });

        const res = await wrapped.chat([{ role: 'user', content: 'Hello' }]);

        expect(res.content).toBe('[MW1] Original provider response');
        expect(mockProvider.chat).toHaveBeenCalledTimes(1);

        const calledMessages = (mockProvider.chat as any).mock.calls[0][0];
        expect(calledMessages).toHaveLength(2);
        expect(calledMessages[1]).toEqual({ role: 'system', content: 'MW Inject' });
      });

      it('should intercept and decorate chatStream flows', async () => {
        // Stream middleware to intercept stream generators
        const streamMW1 = async (params: any, next: any) => {
          const originalGen = await next(params.messages, params.options);
          return (async function* () {
            for await (const chunk of originalGen) {
              if (chunk.content) {
                yield {
                  ...chunk,
                  content: chunk.content.toUpperCase(),
                };
              } else {
                yield chunk;
              }
            }
          })();
        };

        const wrapped = wrapLanguageModel(mockProvider, {
          chat: [],
          chatStream: [streamMW1],
        });

        const stream = wrapped.chatStream([{ role: 'user', content: 'stream' }]);
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        expect(chunks[0]?.content).toBe('CHUNK1');
        expect(chunks[1]?.content).toBe('CHUNK2');
        expect(chunks[2]?.done).toBe(true);
      });
    });
  });
});
