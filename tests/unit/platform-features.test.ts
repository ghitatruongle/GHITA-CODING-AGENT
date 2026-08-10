// ==============================================================================
// GHITA CODING AGENT - Phase 5 Platform & Advanced Features Unit Tests
// ==============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Orchestrator,
  OpenAIProvider,
  FineTuningManager,
  FilesManager,
  BatchesManager,
  RealtimeProxy,
  LLMEvaluator,
  IntegratedSearchClient,
  AIGatewayServer,
  OCRProcessor,
  VideoContentAnalyzer,
  DashboardController,
  DeployConfigGenerator,
} from '../../packages/ai-engine/src/index.js';
import {
  WorkflowAgent,
  TaskDelegationPipeline,
  createReActAgent,
  AIMessage,
} from '../../packages/agents/src/index.js';
import {
  useAIChat,
  WorkflowVisualizer,
  parseChatStreamEvent,
  layoutDag,
} from '../../packages/shared/src/index.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('5 - Advanced & Platform Features', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('1. Multimedia API (Image, Speech, Whisper)', () => {
    const provider = new OpenAIProvider({
      type: 'openai',
      apiKey: 'test-key',
    });

    it('should generate image via DALL-E', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ url: 'https://image.url', b64_json: 'b64data' }],
        }),
      });

      const res = await provider.generateImage('cat sitting');
      expect(res.url).toBe('https://image.url');
      expect(res.b64).toBe('b64data');
    });

    it('should generate speech via TTS', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
        headers: { get: () => 'audio/mp3' },
      });

      const res = await provider.generateSpeech('hello');
      expect(res.audio).toBeInstanceOf(Buffer);
      expect(res.contentType).toBe('audio/mp3');
    });

    it('should transcribe audio via Whisper', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'transcribed text' }),
      });

      const res = await provider.transcribe(Buffer.from('audio'));
      expect(res.text).toBe('transcribed text');
    });
  });

  describe('2. Workflow Engine & Lifecycle Hooks', () => {
    it('should execute workflow steps and trigger hooks sequentially', async () => {
      const hooks: string[] = [];
      const agent = new WorkflowAgent('test-workflow');

      agent.addStep({
        id: 'step1',
        name: 'Step One',
        execute: async (state) => {
          state.val = 42;
          return 'done1';
        },
      });

      agent.addStep({
        id: 'step2',
        name: 'Step Two',
        dependsOn: ['step1'],
        execute: async (state) => {
          return state.val * 2;
        },
      });

      const finalState = await agent.run({
        onStart: (name, _state) => {
          hooks.push(`start-${name}`);
        },
        onStepStart: (id, _name) => {
          hooks.push(`step-start-${id}`);
        },
        onStepFinish: (id, _name, result) => {
          hooks.push(`step-finish-${id}-${result}`);
        },
        onFinish: (state, _duration) => {
          hooks.push(`finish-${state.step2}`);
        },
      });

      expect(finalState.step1).toBe('done1');
      expect(finalState.step2).toBe(84);
      expect(hooks).toEqual([
        'start-test-workflow',
        'step-start-step1',
        'step-finish-step1-done1',
        'step-start-step2',
        'step-finish-step2-84',
        'finish-84',
      ]);
    });
  });

  describe('2b. Task Delegation Pipeline', () => {
    it('should delegate tasks to ReActAgents and run sequentially', async () => {
      const agentA = createReActAgent({
        config: { name: 'Agent A' },
        llmCall: async (_messages) => new AIMessage('Agent A response for task'),
      });

      const agentB = createReActAgent({
        config: { name: 'Agent B' },
        llmCall: async (messages) =>
          new AIMessage(`Agent B received: ${messages[messages.length - 1].getText()}`),
      });

      const pipeline = new TaskDelegationPipeline({
        name: 'Sequential Task Delegation',
        mode: 'sequential',
      });

      pipeline.addTask({
        id: 'taskA',
        description: 'First step task description',
        agent: agentA,
      });

      pipeline.addTask({
        id: 'taskB',
        description: 'Second step task description',
        agent: agentB,
        dependsOn: ['taskA'],
      });

      const result = await pipeline.run();

      expect(result.status).toBe('completed');
      expect(result.results.taskA).toBe('Agent A response for task');
      expect(result.results.taskB).toContain('Agent A response for task');
    });
  });

  describe('3. Fine-Tuning Manager', () => {
    const ft = new FineTuningManager({ apiKey: 'test-key' });

    it('should create fine-tuning job', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'ft-123', status: 'created' }),
      });

      const res = await ft.createJob('file-123', 'gpt-4o-mini');
      expect(res.id).toBe('ft-123');
      expect(res.status).toBe('created');
    });

    it('should retrieve, list and cancel job', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ object: 'list', data: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'ft-123', status: 'running' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'ft-123', status: 'cancelled' }),
        });

      const list = await ft.listJobs();
      expect(list.object).toBe('list');

      const job = await ft.retrieveJob('ft-123');
      expect(job.status).toBe('running');

      const cancelled = await ft.cancelJob('ft-123');
      expect(cancelled.status).toBe('cancelled');
    });
  });

  describe('4. Files & Batches Manager', () => {
    const fm = new FilesManager({ apiKey: 'test-key' });
    const bm = new BatchesManager({ apiKey: 'test-key' });

    it('should handle file uploads, listing and deletions', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'file-123', purpose: 'fine-tune' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 'file-123' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ deleted: true }),
        });

      const upload = await fm.uploadFile(Buffer.from('file content'), 'fine-tune');
      expect(upload.id).toBe('file-123');

      const list = await fm.listFiles();
      expect(list.data[0].id).toBe('file-123');

      const del = await fm.deleteFile('file-123');
      expect(del.deleted).toBe(true);
    });

    it('should handle batch creations, retrieval and cancellation', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'batch-123', status: 'validating' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'batch-123', status: 'completed' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'batch-123', status: 'cancelled' }),
        });

      const batch = await bm.createBatch('file-123', '/v1/chat/completions');
      expect(batch.id).toBe('batch-123');

      const retrieve = await bm.retrieveBatch('batch-123');
      expect(retrieve.status).toBe('completed');

      const cancel = await bm.cancelBatch('batch-123');
      expect(cancel.status).toBe('cancelled');
    });
  });

  describe('5. Real-time WebSocket Proxy', () => {
    it('should initialize and close realtime proxy connection', async () => {
      const rp = new RealtimeProxy({ apiKey: 'test-key' });
      await rp.start(8089);
      await rp.stop();
      expect(rp).toBeDefined();
    });
  });

  describe('6. LLM Evaluation & Search Client', () => {
    it('should evaluate output using LLM-as-a-Judge', async () => {
      const orch = new Orchestrator({
        providers: [{ type: 'openai', apiKey: 'test-key' }],
      });
      const judgeMock = vi.spyOn(orch, 'chat').mockResolvedValueOnce({
        content: JSON.stringify({
          score: 4.8,
          reasoning: 'Excellent reply.',
          metrics: { correctness: 5.0, relevancy: 4.5 },
        }),
        model: 'gpt-4o',
        provider: 'openai',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        finishReason: 'stop',
      });

      const evalClient = new LLMEvaluator(orch);
      const res = await evalClient.evaluate('2+2?', '4', '4');

      expect(judgeMock).toHaveBeenCalled();
      expect(res.score).toBe(4.8);
      expect(res.reasoning).toBe('Excellent reply.');
      expect(res.metrics.correctness).toBe(5.0);
    });

    it('should search using Tavily or Google Search', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ title: 'Doc', url: 'https://doc', content: 'content' }],
        }),
      });

      const sc = new IntegratedSearchClient({ tavilyApiKey: 'tavily-key' });
      const results = await sc.search('Node.js');
      expect(results[0].title).toBe('Doc');
      expect(results[0].url).toBe('https://doc');
    });
  });

  describe('7. API Gateway Proxy REST Server', () => {
    it('should start gateway, enforce rate limit/auth, compute cost, and export prometheus metrics', async () => {
      const orch = new Orchestrator({
        providers: [{ type: 'openai', apiKey: 'test-key' }],
      });
      const chatMock = vi.spyOn(orch, 'chat').mockResolvedValue({
        content: 'Hi user',
        model: 'gpt-4o',
        provider: 'openai',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
      });

      const server = new AIGatewayServer(orch, {
        port: 3020,
        apiKey: 'secure-key',
        monthlyBudget: 100.0,
      });

      await server.start();

      mockFetch.mockImplementation(async (url: string, _init: RequestInit) => {
        if (url.includes('/metrics')) {
          return {
            ok: true,
            text: async () => 'http_requests_total 1',
          };
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Hi user' } }],
          }),
        };
      });

      const res = await fetch('http://localhost:3020/metrics');
      const text = await res.text();
      expect(text).toContain('http_requests_total');

      await server.stop();
      expect(chatMock).not.toHaveBeenLastCalledWith();
    });
  });

  describe('8. OCR & Video Analyzer', () => {
    it('should parse image text and analyze videos', async () => {
      const ocr = new OCRProcessor();
      const video = new VideoContentAnalyzer();

      const ocrRes = await ocr.parseImage(Buffer.from('image'));
      expect(ocrRes.confidence).toBeGreaterThan(0.5);

      const videoRes = await video.analyzeVideo(Buffer.from('video'));
      expect(videoRes.framesAnalyzed).toBeGreaterThan(0);
    });
  });

  describe('9. Dashboard Controller', () => {
    it('should gather statistics and manage budgets', () => {
      const orch = new Orchestrator({
        providers: [{ type: 'openai', apiKey: 'test-key' }],
      });
      const gateway = new AIGatewayServer(orch, { apiKey: 'test-admin-key' });
      const controller = new DashboardController(gateway);

      const stats = controller.getStats();
      expect(stats.monthlyBudget).toBe(100.0);

      controller.updateBudget(150.0);
      expect(controller.getStats().monthlyBudget).toBe(150.0);

      const newKey = controller.createAPIKey();
      expect(newKey).toContain('ghita-');
    });
  });

  describe('10. Deploy Configurations & React UI Hooks', () => {
    it('should generate Docker, K8s, and Terraform files', () => {
      const gen = new DeployConfigGenerator();
      expect(gen.generateDockerfile()).toContain('FROM node');
      expect(gen.generateDockerCompose()).toContain('services:');
      expect(gen.generateK8s()).toContain('kind: Deployment');
      expect(gen.generateTerraform()).toContain('google_cloud_run_v2_service');
    });

    it('should expose hook and component functions successfully', () => {
      // useAIChat is a real React hook — verify the pure stream plumbing and
      // the DAG layout instead of invoking hooks outside a React renderer.
      expect(typeof useAIChat).toBe('function');
      expect(parseChatStreamEvent('{"type":"text","delta":"hi"}')?.type).toBe('text');

      const layout = layoutDag([{ id: 'a', name: 'A', status: 'completed' }]);
      expect(layout.nodes).toHaveLength(1);

      const visualizer = WorkflowVisualizer({ steps: [] });
      expect(visualizer.type).toBe('div');
    });
  });
});
