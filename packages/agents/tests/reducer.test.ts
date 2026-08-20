import { describe, expect, it } from 'vitest';
import { createInitialState, agentRunReducer, replayEvents } from '../src/reducer.js';
import type { AgentRunEvent } from '../src/reducer.js';

describe('createInitialState', () => {
  it('returns a clean idle state', () => {
    const state = createInitialState();
    expect(state.status).toBe('idle');
    expect(state.agentId).toBeNull();
    expect(state.iterations).toBe(0);
    expect(state.steps).toEqual([]);
    expect(state.modelResponses).toEqual([]);
  });
});

describe('agentRunReducer', () => {
  it('handles session_start', () => {
    const state = agentRunReducer(createInitialState(), {
      type: 'session_start',
      agentId: 'a1',
      userMessage: 'fix bug',
      timestamp: 100,
    });
    expect(state.agentId).toBe('a1');
    expect(state.userMessage).toBe('fix bug');
    expect(state.status).toBe('running');
    expect(state.lastTimestamp).toBe(100);
  });

  it('handles tool_call and tool_result pairing', () => {
    let state = createInitialState();
    state = agentRunReducer(state, {
      type: 'tool_call',
      toolCallId: 'tc1',
      tool: 'read_file',
      input: { path: 'x.ts' },
      timestamp: 200,
    });
    expect(state.steps).toHaveLength(1);
    expect(state.steps[0].observation).toBeNull();

    state = agentRunReducer(state, {
      type: 'tool_result',
      toolCallId: 'tc1',
      tool: 'read_file',
      observation: 'file contents here',
      timestamp: 201,
    });
    expect(state.steps[0].observation).toBe('file contents here');
  });

  it('handles model_response', () => {
    const state = agentRunReducer(createInitialState(), {
      type: 'model_response',
      content: 'I will check the file',
      timestamp: 150,
    });
    expect(state.modelResponses).toHaveLength(1);
    expect(state.modelResponses[0].content).toBe('I will check the file');
  });

  it('handles iteration_complete', () => {
    const state = agentRunReducer(createInitialState(), {
      type: 'iteration_complete',
      iteration: 2,
      timestamp: 300,
    });
    expect(state.iterations).toBe(3);
  });

  it('handles run_complete', () => {
    const state = agentRunReducer(createInitialState(), {
      type: 'run_complete',
      output: 'done!',
      timestamp: 400,
    });
    expect(state.status).toBe('completed');
    expect(state.output).toBe('done!');
  });

  it('handles run_error', () => {
    const state = agentRunReducer(createInitialState(), {
      type: 'run_error',
      error: 'timeout',
      timestamp: 500,
    });
    expect(state.status).toBe('error');
    expect(state.error).toBe('timeout');
  });

  it('does not mutate the input state', () => {
    const original = createInitialState();
    const next = agentRunReducer(original, {
      type: 'session_start',
      agentId: 'a1',
      userMessage: 'hi',
      timestamp: 100,
    });
    expect(original.agentId).toBeNull();
    expect(next.agentId).toBe('a1');
    expect(original).not.toBe(next);
  });
});

describe('replayEvents (determinism)', () => {
  const buildEventLog = (): AgentRunEvent[] => [
    { type: 'session_start', agentId: 'agent-x', userMessage: 'refactor auth', timestamp: 1000 },
    { type: 'model_response', content: 'Let me read the auth module', timestamp: 1001 },
    {
      type: 'tool_call',
      toolCallId: 'tc-1',
      tool: 'read_file',
      input: { path: 'auth.ts' },
      timestamp: 1002,
    },
    {
      type: 'tool_result',
      toolCallId: 'tc-1',
      tool: 'read_file',
      observation: 'export function login() {}',
      timestamp: 1003,
    },
    { type: 'iteration_complete', iteration: 0, timestamp: 1004 },
    { type: 'model_response', content: 'Now I will refactor', timestamp: 1005 },
    {
      type: 'tool_call',
      toolCallId: 'tc-2',
      tool: 'write_file',
      input: { path: 'auth.ts' },
      timestamp: 1006,
    },
    {
      type: 'tool_result',
      toolCallId: 'tc-2',
      tool: 'write_file',
      observation: 'written',
      timestamp: 1007,
    },
    { type: 'iteration_complete', iteration: 1, timestamp: 1008 },
    { type: 'run_complete', output: 'Refactoring complete', timestamp: 1009 },
  ];

  it('produces identical state when replayed multiple times', () => {
    const events = buildEventLog();
    const state1 = replayEvents(events);
    const state2 = replayEvents(events);
    const state3 = replayEvents(events);

    expect(JSON.stringify(state1)).toBe(JSON.stringify(state2));
    expect(JSON.stringify(state2)).toBe(JSON.stringify(state3));
  });

  it('reconstructs correct final state from event log', () => {
    const state = replayEvents(buildEventLog());
    expect(state.agentId).toBe('agent-x');
    expect(state.userMessage).toBe('refactor auth');
    expect(state.status).toBe('completed');
    expect(state.output).toBe('Refactoring complete');
    expect(state.iterations).toBe(2);
    expect(state.steps).toHaveLength(2);
    expect(state.steps[0].tool).toBe('read_file');
    expect(state.steps[0].observation).toBe('export function login() {}');
    expect(state.steps[1].tool).toBe('write_file');
    expect(state.modelResponses).toHaveLength(2);
    expect(state.lastTimestamp).toBe(1009);
  });

  it('supports partial replay (first N events)', () => {
    const events = buildEventLog();
    const partial = replayEvents(events.slice(0, 5));
    expect(partial.status).toBe('running');
    expect(partial.steps).toHaveLength(1);
    expect(partial.iterations).toBe(1);
    expect(partial.output).toBeNull();
  });

  it('supports resume from intermediate state', () => {
    const events = buildEventLog();
    const midState = replayEvents(events.slice(0, 5));
    const resumed = replayEvents(events.slice(5), midState);
    const full = replayEvents(events);
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(full));
  });

  it('handles empty event log', () => {
    const state = replayEvents([]);
    expect(state.status).toBe('idle');
    expect(state.steps).toEqual([]);
  });

  it('handles error termination', () => {
    const events: AgentRunEvent[] = [
      { type: 'session_start', agentId: 'a1', userMessage: 'do thing', timestamp: 100 },
      { type: 'run_error', error: 'LLM timeout', timestamp: 200 },
    ];
    const state = replayEvents(events);
    expect(state.status).toBe('error');
    expect(state.error).toBe('LLM timeout');
    expect(state.output).toBeNull();
  });
});
