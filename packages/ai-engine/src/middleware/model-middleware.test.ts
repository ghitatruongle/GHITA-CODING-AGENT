import { describe, expect, it } from 'vitest';
import {
  createExtractReasoningMiddleware,
  createSimulateStreamingMiddleware,
  createRepairedParseMiddleware,
} from './model-middleware.js';
import { AIMessage } from '@ghita/agents';
import type { MiddlewareContext } from '@ghita/agents';

function makeCtx(): MiddlewareContext {
  return {
    agent: {} as never,
    messages: [],
    metadata: {},
  };
}

describe('extractReasoning', () => {
  it('extracts <thinking> tags into metadata and strips from content', async () => {
    const mw = createExtractReasoningMiddleware();
    const msg = new AIMessage('<thinking>Let me reason about this...</thinking>The answer is 42.');
    const result = await mw.postModel!(makeCtx(), { response: msg, shouldContinue: false });
    expect(result?.response?.getText()).toBe('The answer is 42.');
    expect((result?.response?.metadata as Record<string, unknown>)?.reasoning).toBe(
      'Let me reason about this...',
    );
  });

  it('passes through when no thinking tags present', async () => {
    const mw = createExtractReasoningMiddleware();
    const msg = new AIMessage('Just a normal response.');
    const result = await mw.postModel!(makeCtx(), { response: msg, shouldContinue: false });
    expect(result).toBeUndefined();
  });
});

describe('simulateStreaming', () => {
  it('returns undefined (no-op for non-stream context)', async () => {
    const mw = createSimulateStreamingMiddleware();
    const msg = new AIMessage('Hello world');
    const result = await mw.postModel!(makeCtx(), { response: msg, shouldContinue: false });
    // simulateStreaming is a postModel pass-through; real streaming happens at provider level
    expect(result).toBeUndefined();
  });
});

describe('repairedParse', () => {
  it('parses valid JSON in code fences', async () => {
    const mw = createRepairedParseMiddleware();
    const msg = new AIMessage('Here is the result:\n```json\n{"answer": 42}\n```\nDone.');
    const result = await mw.postModel!(makeCtx(), { response: msg, shouldContinue: false });
    expect(result).toBeDefined();
    const meta = result?.response?.metadata as Record<string, unknown>;
    expect(meta?.parseStatus).toBe('success');
    expect(meta?.parsedOutput).toEqual({ answer: 42 });
  });

  it('marks failed parse when JSON is invalid', async () => {
    const mw = createRepairedParseMiddleware();
    const msg = new AIMessage('Result: ```json\n{invalid json}\n```');
    const result = await mw.postModel!(makeCtx(), { response: msg, shouldContinue: false });
    expect(result).toBeDefined();
    const meta = result?.response?.metadata as Record<string, unknown>;
    expect(meta?.parseStatus).toBe('failed');
  });

  it('passes through when no code fence present', async () => {
    const mw = createRepairedParseMiddleware();
    const msg = new AIMessage('No JSON here, just text.');
    const result = await mw.postModel!(makeCtx(), { response: msg, shouldContinue: false });
    expect(result).toBeUndefined();
  });
});
