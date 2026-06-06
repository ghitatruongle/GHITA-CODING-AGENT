import { describe, it, expect, vi } from 'vitest';
import {
  LLMJudge,
  DEFAULT_JUDGE_RULES,
} from '../../packages/ai-engine/src/enterprise/llm-judge.js';
import {
  extractReasoning,
  ReasoningStreamExtractor,
} from '../../packages/ai-engine/src/utils/reasoning.js';
import { RalphLoopManager } from '../../packages/ai-engine/src/utils/ralph.js';
import { Orchestrator } from '../../packages/ai-engine/src/orchestrator.js';
import type { AIProvider, ChatResponse } from '../../packages/ai-engine/src/types.js';

describe('11: LLM-as-Judge Evaluator & Ralph Loop', () => {
  describe('LLMJudge', () => {
    it('should evaluate content using safety rule', async () => {
      const mockProvider: AIProvider = {
        name: 'mock',
        chat: vi.fn().mockResolvedValue({
          content: '{"score": 0.2, "verdict": "pass", "reasoning": "Looks safe enough."}',
          role: 'assistant',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          model: 'mock-model',
        } as ChatResponse),
      } as unknown as AIProvider;

      const judge = new LLMJudge({ provider: mockProvider });

      const result = await judge.evaluate('Hello, how are you?', 'safety');

      expect(result.passed).toBe(true);
      expect(result.score).toBe(0.2);
      expect(result.verdict).toBe('pass');
      expect(result.reasoning).toBe('Looks safe enough.');
      expect(mockProvider.chat).toHaveBeenCalled();
    });

    it('should fail if score exceeds threshold', async () => {
      const mockProvider: AIProvider = {
        name: 'mock',
        chat: vi.fn().mockResolvedValue({
          content: '{"score": 0.9, "verdict": "fail", "reasoning": "Very unsafe!"}',
          role: 'assistant',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          model: 'mock-model',
        } as ChatResponse),
      } as unknown as AIProvider;

      const judge = new LLMJudge({ provider: mockProvider });

      const result = await judge.evaluate('How to hack?', 'safety');

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.9);
      expect(result.verdict).toBe('fail');
    });

    it('should evaluate aggregate correctly', async () => {
      const mockProvider: AIProvider = {
        name: 'mock',
        chat: vi
          .fn()
          .mockResolvedValueOnce({
            content: '{"score": 0.1, "verdict": "pass", "reasoning": "Safe"}',
          })
          .mockResolvedValueOnce({
            content: '{"score": 0.2, "verdict": "pass", "reasoning": "High quality"}',
          }),
      } as unknown as AIProvider;

      const judge = new LLMJudge({ provider: mockProvider });
      const aggregate = await judge.evaluateAggregate('Some good content');

      expect(aggregate.passed).toBe(true);
      expect(aggregate.allResults.length).toBe(2);
      expect(aggregate.allResults[0].task).toBe('safety');
      expect(aggregate.allResults[1].task).toBe('quality');
    });
  });

  describe('Reasoning Extraction', () => {
    it('should statically extract reasoning blocks', () => {
      const text = '<think>I need to plan this</think>\nHere is the plan.';
      const result = extractReasoning(text);
      expect(result.reasoning).toBe('I need to plan this');
      expect(result.content).toBe('Here is the plan.');
    });

    it('should handle unclosed thinking blocks', () => {
      const text = 'Some content<think>Wait, I am cut of';
      const result = extractReasoning(text);
      expect(result.reasoning).toBe('Wait, I am cut of');
      expect(result.content).toBe('Some content');
    });

    it('should stream extract reasoning properly', () => {
      const extractor = new ReasoningStreamExtractor();

      let res = extractor.processChunk('Hello <th');
      expect(res.contentSlice).toBe('Hello ');
      expect(res.isThinking).toBe(false);

      res = extractor.processChunk('ink>This is thought</th');
      expect(res.contentSlice).toBe('');
      expect(res.reasoningSlice).toBe('This is thought');
      expect(res.isThinking).toBe(true);

      res = extractor.processChunk('ink> Now the real content');
      expect(res.reasoningSlice).toBe('');
      expect(res.contentSlice).toBe(' Now the real content');
      expect(res.isThinking).toBe(false);

      const flushed = extractor.flush();
      expect(flushed.contentSlice).toBe('');
    });
  });

  describe('RalphLoopManager', () => {
    it('should successfully complete a self-correcting loop', async () => {
      const mockOrchestrator = {
        chat: vi
          .fn()
          .mockResolvedValueOnce({
            content: '```typescript\nconsole.log("error code");\n```',
            usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          })
          .mockResolvedValueOnce({
            content: '```typescript\nconsole.log("fixed code");\n```',
            usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
          }),
      } as unknown as Orchestrator;

      const ralph = new RalphLoopManager(mockOrchestrator, { maxIterations: 3 });

      let executionCount = 0;
      const executeAction = async (code: string) => {
        executionCount++;
        if (executionCount === 1) {
          return { success: false, logs: 'Syntax error on line 1' };
        }
        return { success: true, logs: 'Compiled successfully' };
      };

      const progressLogs: string[] = [];
      const onProgress = (status: any) => {
        progressLogs.push(status.message);
      };

      const state = await ralph.run('Write a hello world program', executeAction, onProgress);

      expect(state.success).toBe(true);
      expect(state.currentIteration).toBe(2);
      expect(executionCount).toBe(2);
      expect(progressLogs.length).toBeGreaterThan(2);
      expect(state.totalCostUsd).toBeGreaterThan(0);
    });

    it('should stop when cost limit is exceeded', async () => {
      const mockOrchestrator = {
        chat: vi.fn().mockResolvedValue({
          content: '```typescript\nconsole.log("infinite loop");\n```',
          // High usage to quickly exceed budget
          usage: { promptTokens: 200000, completionTokens: 50000, totalTokens: 250000 },
        }),
      } as unknown as Orchestrator;

      const ralph = new RalphLoopManager(mockOrchestrator, { maxIterations: 5, costLimitUsd: 1.0 });

      const executeAction = async () => ({ success: false, logs: 'Failed again' });
      const onProgress = vi.fn();

      const state = await ralph.run('Do task', executeAction, onProgress);

      expect(state.success).toBe(false);
      expect(state.currentIteration).toBeGreaterThan(0);
      expect(state.currentIteration).toBeLessThan(5); // Stopped early due to cost limit
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Chạm giới hạn chi phí tối đa'),
        }),
      );
    });
  });
});
