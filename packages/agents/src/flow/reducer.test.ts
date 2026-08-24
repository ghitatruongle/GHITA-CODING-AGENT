// Tests cover:
// 1. Idempotency: same eventId processed twice yields identical state
// 2. Replay: events replayed in order reconstruct prior state
// 3. Resume handler: POST /threads/:id/resume reconstructs thread
// 4. Event types: message, tool_call, error all processed correctly

import {
  processEvent,
  resumeThread,
  handleResumeRequest,
  createInitialThreadState,
  InMemoryThreadStore,
  type MessageEvent,
  type ToolCallEvent,
  type ErrorEvent,
} from './reducer.js';

function ts(seq: number): string {
  return `2026-06-04T00:00:${String(seq).padStart(2, '0')}Z`;
}

function makeMessage(
  seq: number,
  eventId: string,
  content: string,
  role: 'user' | 'assistant' = 'user',
): MessageEvent {
  return {
    type: 'message',
    eventId,
    threadId: 't1',
    timestamp: ts(seq),
    seq,
    role,
    content,
    tokens: { input: 10, output: 0 },
  };
}

function makeToolCall(
  seq: number,
  eventId: string,
  status: 'pending' | 'running' | 'completed' | 'failed' = 'completed',
): ToolCallEvent {
  return {
    type: 'tool_call',
    eventId,
    threadId: 't1',
    timestamp: ts(seq),
    seq,
    toolName: 'read_file',
    input: { path: '/tmp/x' },
    output: { ok: true },
    status,
  };
}

function makeError(seq: number, eventId: string, recoverable: boolean): ErrorEvent {
  return {
    type: 'error',
    eventId,
    threadId: 't1',
    timestamp: ts(seq),
    seq,
    code: 'TEST_ERR',
    message: 'simulated error',
    recoverable,
  };
}

// ----- Test 1: Initial state -----
export function testInitialState() {
  const state = createInitialThreadState('t1');
  if (state.threadId !== 't1') throw new Error('threadId mismatch');
  if (state.status !== 'idle') throw new Error('initial status should be idle');
  if (state.messages.length !== 0) throw new Error('messages should be empty');
  if (state.lastSeq !== -1) throw new Error('initial lastSeq should be -1');
  return 'PASS: initial state';
}

// ----- Test 2: processEvent — message adds to thread -----
export function testMessageEvent() {
  let state = createInitialThreadState('t1');
  state = processEvent(state, makeMessage(0, 'e1', 'hello'));
  if (state.messages.length !== 1) throw new Error('expected 1 message');
  if (state.messages[0] !== 'e1') throw new Error('expected eventId e1');
  if (state.status !== 'active') throw new Error('status should become active after user message');
  if (state.lastSeq !== 0) throw new Error('lastSeq should be 0');
  if (state.tokenUsage.input !== 10) throw new Error('input tokens should be 10');
  return 'PASS: message event';
}

// ----- Test 3: Idempotency -----
export function testIdempotency() {
  const state = createInitialThreadState('t1');
  const event = makeMessage(0, 'e1', 'hello');
  const s1 = processEvent(state, event);
  const s2 = processEvent(s1, event);
  if (s2.messages.length !== 1) throw new Error('idempotency: messages should still be 1');
  if (s2.processedEventIds.length !== 1)
    throw new Error('idempotency: processedEventIds should still be 1');
  if (s2.tokenUsage.input !== 10) throw new Error('idempotency: tokens should not double-count');
  if (s2.lastSeq !== 0) throw new Error('idempotency: lastSeq should remain 0');
  return 'PASS: idempotency';
}

// ----- Test 4: Replay -----
export function testReplay() {
  const events = [
    makeMessage(0, 'e1', 'hello'),
    makeMessage(1, 'e2', 'world', 'assistant'),
    makeToolCall(2, 'e3', 'completed'),
    makeMessage(3, 'e4', 'done', 'assistant'),
  ];
  let state = createInitialThreadState('t1');
  for (const e of events) state = processEvent(state, e);
  if (state.messages.length !== 3) throw new Error('replay: expected 3 messages');
  if (state.lastSeq !== 3) throw new Error('replay: lastSeq should be 3');
  if (!state.toolCalls['e3']) throw new Error('replay: tool call e3 missing');
  return 'PASS: replay';
}

// ----- Test 5: Out-of-order events are rejected -----
export function testOutOfOrder() {
  let state = createInitialThreadState('t1');
  state = processEvent(state, makeMessage(5, 'e1', 'late'));
  const before = state;
  const after = processEvent(state, makeMessage(3, 'e2', 'early'));
  if (after !== before) throw new Error('out-of-order: state should be unchanged (same reference)');
  if (after.lastSeq !== 5) throw new Error('out-of-order: lastSeq should remain 5');
  return 'PASS: out-of-order rejection';
}

// ----- Test 6: Error non-recoverable -----
export function testErrorNonRecoverable() {
  let state = createInitialThreadState('t1');
  state = processEvent(state, makeMessage(0, 'e1', 'go'));
  state = processEvent(state, makeError(1, 'e2', false));
  if (state.status !== 'failed') throw new Error('non-recoverable error should fail thread');
  if (!state.errors['e2']) throw new Error('error should be recorded');
  return 'PASS: error non-recoverable';
}

// ----- Test 7: Error recoverable keeps active -----
export function testErrorRecoverable() {
  let state = createInitialThreadState('t1');
  state = processEvent(state, makeMessage(0, 'e1', 'go'));
  state = processEvent(state, makeError(1, 'e2', true));
  if (state.status === 'failed') throw new Error('recoverable error should NOT fail thread');
  if (!state.errors['e2']) throw new Error('recoverable error should still be recorded');
  return 'PASS: error recoverable';
}

// ----- Test 8: Tool call failed -----
export function testToolCallFailed() {
  let state = createInitialThreadState('t1');
  state = processEvent(state, makeMessage(0, 'e1', 'go'));
  state = processEvent(state, makeToolCall(1, 'e2', 'failed'));
  if (state.status !== 'failed') throw new Error('failed tool call should fail thread');
  return 'PASS: tool_call failed';
}

// ----- Test 9: resumeThread from store -----
export function testResumeFromStore() {
  const store = new InMemoryThreadStore();
  const events = [makeMessage(0, 'e1', 'first'), makeMessage(1, 'e2', 'second')];
  let state = createInitialThreadState('t1');
  for (const e of events) state = processEvent(state, e);
  store.save(state);

  const resumed = resumeThread(store, 't1', events);
  if (resumed.messages.length !== 2) throw new Error('resume: expected 2 messages');
  if (resumed.tokenUsage.input !== 20)
    throw new Error('resume: tokens should remain 20 (idempotent)');
  return 'PASS: resume from store';
}

// ----- Test 10: handleResumeRequest -----
export function testHandleResumeRequest() {
  const store = new InMemoryThreadStore();
  const events = [makeMessage(0, 'e1', 'hi')];
  const res = handleResumeRequest(store, { threadId: 't1', events });
  if (!res.ok) throw new Error(`resume request should succeed: ${res.error}`);
  if (!res.state) throw new Error('state should be returned');
  if (res.state.messages.length !== 1) throw new Error('state should have 1 message');
  return 'PASS: HTTP resume handler';
}

// ----- Test 11: handleResumeRequest validates input -----
export function testHandleResumeValidation() {
  const store = new InMemoryThreadStore();
  const noThreadId = handleResumeRequest(store, { threadId: '', events: [] });
  if (noThreadId.ok) throw new Error('empty threadId should fail');
  const noEvents = handleResumeRequest(store, { threadId: 't1', events: null as unknown as never });
  if (noEvents.ok) throw new Error('null events should fail');
  return 'PASS: HTTP resume validation';
}

// ----- Test 12: Immutability -----
export function testImmutability() {
  const initial = createInitialThreadState('t1');
  const event = makeMessage(0, 'e1', 'hello');
  const next = processEvent(initial, event);
  if (next === initial) throw new Error('reducer should return new state, not mutate');
  if (initial.messages.length !== 0) throw new Error('original state should be unchanged');
  if (next.messages.length !== 1) throw new Error('new state should have the event');
  return 'PASS: immutability';
}

// ----- Runner -----
export function runAllReducerTests(): { passed: number; failed: number; results: string[] } {
  const tests = [
    testInitialState,
    testMessageEvent,
    testIdempotency,
    testReplay,
    testOutOfOrder,
    testErrorNonRecoverable,
    testErrorRecoverable,
    testToolCallFailed,
    testResumeFromStore,
    testHandleResumeRequest,
    testHandleResumeValidation,
    testImmutability,
  ];

  const results: string[] = [];
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      const r = t();
      results.push(r);
      passed++;
    } catch (err) {
      results.push(`FAIL: ${t.name} — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  return { passed, failed, results };
}
