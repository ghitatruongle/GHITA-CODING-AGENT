// ==============================================================================
// v1.1.5-beta1 Track 1.3 — Headless/CI mode tests (scripted LLM, no network)
// ==============================================================================

import { describe, expect, it } from 'vitest';
import { runHeadless } from '../src/headless/runner.js';
import type { HeadlessEvent } from '../src/headless/runner.js';
import { AIMessage } from '../src/messages/message.js';
import type { BaseMessage } from '../src/messages/message.js';
import type { ReActTool } from '../src/react/types.js';

const dateTool: ReActTool = {
  name: 'get_date',
  description: 'returns a fixed date',
  parameters: { type: 'object', properties: {} },
  execute: async () => '2026-08-16',
};

const forbiddenTool: ReActTool = {
  name: 'shell_exec',
  description: 'runs a shell command',
  parameters: { type: 'object', properties: {} },
  execute: async () => 'ok',
};

function collect(events: HeadlessEvent[]): (e: HeadlessEvent) => void {
  return (e) => events.push(e);
}

describe('runHeadless', () => {
  it('streams a stable JSON-lines event sequence and exits 0 on success', async () => {
    let call = 0;
    const llm = async (): Promise<BaseMessage> => {
      call += 1;
      if (call === 1) {
        return new AIMessage('need date', {
          toolCalls: [{ id: 'c1', name: 'get_date', arguments: {} }],
        });
      }
      return new AIMessage('the date is 2026-08-16');
    };
    const events: HeadlessEvent[] = [];
    const result = await runHeadless(
      { prompt: 'what date is it?', tools: [dateTool] },
      { llmCall: llm, emit: collect(events) },
    );

    expect(result.exitCode).toBe(0);
    expect(result.agentResult?.output).toBe('the date is 2026-08-16');

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('session_start');
    expect(types).toContain('message');
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types).toContain('turn_end');
    expect(types[types.length - 1]).toBe('done');

    // Every event carries the session id + timestamp — the stream contract.
    const sessionId = events.at(0)?.sessionId;
    expect(sessionId).toBeTruthy();
    for (const event of events) {
      expect(event.sessionId).toBe(sessionId);
      expect(typeof event.ts).toBe('number');
    }

    const toolCall = events.find((e) => e.type === 'tool_call');
    expect(toolCall?.tool).toBe('get_date');
    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult?.output).toBe('2026-08-16');
  });

  it('--tools allowlist excludes tools not listed', async () => {
    let call = 0;
    const llm = async (): Promise<BaseMessage> => {
      call += 1;
      if (call === 1) {
        return new AIMessage('exec', {
          toolCalls: [{ id: 'c1', name: 'shell_exec', arguments: { cmd: 'rm -rf /' } }],
        });
      }
      return new AIMessage('done');
    };
    const events: HeadlessEvent[] = [];
    const result = await runHeadless(
      { prompt: 'run it', tools: [dateTool, forbiddenTool], toolsAllowlist: ['get_date'] },
      { llmCall: llm, emit: collect(events) },
    );
    expect(result.exitCode).toBe(0);
    // shell_exec was filtered out → agent sees "tool not found" observation.
    expect(result.agentResult?.steps[0]?.observation).toContain('not found');
  });

  it('forkSession marks the session as forked from the parent', async () => {
    const events: HeadlessEvent[] = [];
    await runHeadless(
      { prompt: 'hi', forkSession: 'sess-42' },
      { llmCall: async () => new AIMessage('ok'), emit: collect(events) },
    );
    const start = events.at(0);
    expect(start?.type).toBe('session_start');
    expect(start?.forkedFrom).toBe('sess-42');
    expect(start?.sessionId.startsWith('sess-42-fork')).toBe(true);
  });

  it('exits 1 on runtime errors', async () => {
    const events: HeadlessEvent[] = [];
    const result = await runHeadless(
      { prompt: 'hi' },
      {
        llmCall: async () => {
          throw new Error('provider down');
        },
        emit: collect(events),
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.agentResult).toBeNull();
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent?.error).toContain('provider down');
    expect(events[events.length - 1]?.exitCode).toBe(1);
  });

  it('exits 2 when the run exhausts max turns without a final answer (durable path)', async () => {
    // Every turn requests a tool → never produces a final answer.
    const llm = async (): Promise<BaseMessage> =>
      new AIMessage('more', {
        toolCalls: [{ id: `c${Date.now()}`, name: 'get_date', arguments: {} }],
      });
    const events: HeadlessEvent[] = [];
    const result = await runHeadless(
      { prompt: 'loop forever', tools: [dateTool], maxTurns: 2, sessionId: 'exhaust-test' },
      { llmCall: llm, emit: collect(events) },
    );
    // sessionId → runId → durable path → ReActIterationLimitError → exit 2.
    expect(result.exitCode).toBe(2);
    expect(result.agentResult).toBeNull();
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent?.error).toContain('iteration limit');
    expect(events[events.length - 1]?.type).toBe('done');
  });
});
