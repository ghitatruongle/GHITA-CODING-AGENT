// ==============================================================================
// GHITA CODING AGENT - Reducer Pattern (Phase 5 — Update 0.0.3)
// ==============================================================================
// Implements the Redux-style reducer pattern for thread/event processing.
// - Pure function: processEvent(state, event) -> newState
// - Event types: message, tool_call, error
// - Idempotency: same eventId processed twice yields identical state
// - Replay: events can be replayed in order to reconstruct any prior state
// - Thread resume: HTTP-style resume handler at POST /threads/:id/resume
// ==============================================================================

// ----- Event Types -----

export type ReducerEventType = 'message' | 'tool_call' | 'error';

export interface ReducerEventBase {
  /** Unique event ID — used for idempotency / dedup */
  eventId: string;
  /** Thread this event belongs to */
  threadId: string;
  /** ISO timestamp */
  timestamp: string;
  /** Monotonic sequence number within the thread (for replay ordering) */
  seq: number;
}

export interface MessageEvent extends ReducerEventBase {
  type: 'message';
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Optional token usage metadata */
  tokens?: { input: number; output: number };
}

export interface ToolCallEvent extends ReducerEventBase {
  type: 'tool_call';
  toolName: string;
  input: unknown;
  output?: unknown;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface ErrorEvent extends ReducerEventBase {
  type: 'error';
  code: string;
  message: string;
  /** Whether the error is recoverable (retryable) */
  recoverable: boolean;
  /** Source event that caused the error, if any */
  causedBy?: string;
}

export type ReducerEvent = MessageEvent | ToolCallEvent | ErrorEvent;

// ----- Thread State -----

export type ThreadStatus = 'idle' | 'active' | 'paused' | 'completed' | 'failed';

export interface ThreadState {
  threadId: string;
  status: ThreadStatus;
  /** Ordered list of message event IDs in this thread */
  messages: string[];
  /** Map of tool call eventId -> ToolCallEvent */
  toolCalls: Record<string, ToolCallEvent>;
  /** Map of error eventId -> ErrorEvent */
  errors: Record<string, ErrorEvent>;
  /** Set of eventIds already processed (idempotency guard) */
  processedEventIds: string[];
  /** Total input/output tokens */
  tokenUsage: { input: number; output: number };
  /** Last update timestamp */
  updatedAt: string;
  /** Highest seq processed (for replay resume) */
  lastSeq: number;
}

export function createInitialThreadState(threadId: string): ThreadState {
  return {
    threadId,
    status: 'idle',
    messages: [],
    toolCalls: {},
    errors: {},
    processedEventIds: [],
    tokenUsage: { input: 0, output: 0 },
    updatedAt: new Date().toISOString(),
    lastSeq: -1,
  };
}

// ----- Reducer (pure function) -----

/**
 * Pure reducer: (state, event) -> newState
 * - Idempotent: applying the same event twice yields identical result
 * - Deterministic: same input always produces same output
 * - Immutable: returns a new state object, never mutates input
 */
export function processEvent(state: ThreadState, event: ReducerEvent): ThreadState {
  // Idempotency check: if eventId already processed, return state unchanged
  if (state.processedEventIds.includes(event.eventId)) {
    return state;
  }

  // Out-of-order event: ignore events with seq <= lastSeq (out-of-order rejection)
  // Exception: events from the past (replay) with same seq are dedup'd above
  if (event.seq <= state.lastSeq && state.lastSeq >= 0) {
    // Only allow replay events that match a known seq (idempotency already handled above)
    return state;
  }

  let next: ThreadState;

  switch (event.type) {
    case 'message': {
      const nextMessages = event.role === 'user' || event.role === 'assistant'
        ? [...state.messages, event.eventId]
        : state.messages;
      const nextTokens = {
        input: state.tokenUsage.input + (event.tokens?.input ?? 0),
        output: state.tokenUsage.output + (event.tokens?.output ?? 0),
      };
      next = {
        ...state,
        status: state.status === 'idle' ? 'active' : state.status,
        messages: nextMessages,
        tokenUsage: nextTokens,
        processedEventIds: [...state.processedEventIds, event.eventId],
        updatedAt: event.timestamp,
        lastSeq: event.seq,
      };
      break;
    }

    case 'tool_call': {
      next = {
        ...state,
        status: event.status === 'failed' ? 'failed' : state.status,
        toolCalls: {
          ...state.toolCalls,
          [event.eventId]: { ...event },
        },
        processedEventIds: [...state.processedEventIds, event.eventId],
        updatedAt: event.timestamp,
        lastSeq: event.seq,
      };
      break;
    }

    case 'error': {
      next = {
        ...state,
        status: event.recoverable ? state.status : 'failed',
        errors: {
          ...state.errors,
          [event.eventId]: { ...event },
        },
        processedEventIds: [...state.processedEventIds, event.eventId],
        updatedAt: event.timestamp,
        lastSeq: event.seq,
      };
      break;
    }

    default: {
      // Unknown event type — return state unchanged
      return state;
    }
  }

  return next;
}

// ----- Thread Resume Logic -----

export interface ThreadStore {
  load(threadId: string): ThreadState | undefined;
  save(state: ThreadState): void;
}

/**
 * Resume a thread: apply all events from a replay buffer in order.
 * Used by POST /threads/:id/resume — caller supplies the events to replay
 * and this returns the reconstructed state.
 */
export function resumeThread(
  store: ThreadStore,
  threadId: string,
  events: ReducerEvent[],
): ThreadState {
  // Sort events by seq ascending for deterministic replay
  const sorted = [...events].sort((a, b) => a.seq - b.seq);

  let state = store.load(threadId) ?? createInitialThreadState(threadId);

  for (const event of sorted) {
    state = processEvent(state, event);
  }

  store.save(state);
  return state;
}

// ----- HTTP Handler Adapter -----

/**
 * HTTP-style handler for POST /threads/:id/resume
 * Adapter-agnostic: caller wires this into their HTTP framework.
 */
export interface ResumeRequest {
  threadId: string;
  events: ReducerEvent[];
}

export interface ResumeResponse {
  ok: boolean;
  state?: ThreadState;
  error?: string;
}

export function handleResumeRequest(
  store: ThreadStore,
  req: ResumeRequest,
): ResumeResponse {
  try {
    if (!req.threadId || typeof req.threadId !== 'string') {
      return { ok: false, error: 'threadId is required' };
    }
    if (!Array.isArray(req.events)) {
      return { ok: false, error: 'events must be an array' };
    }
    // Validate event shape
    for (const e of req.events) {
      if (!e.eventId || !e.type || typeof e.seq !== 'number') {
        return { ok: false, error: `Invalid event: missing eventId/type/seq` };
      }
    }
    const state = resumeThread(store, req.threadId, req.events);
    return { ok: true, state };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ----- In-Memory Store (default implementation) -----

export class InMemoryThreadStore implements ThreadStore {
  private readonly threads = new Map<string, ThreadState>();

  load(threadId: string): ThreadState | undefined {
    const t = this.threads.get(threadId);
    if (!t) return undefined;
    // Return a deep copy to preserve immutability contract
    return JSON.parse(JSON.stringify(t));
  }

  save(state: ThreadState): void {
    this.threads.set(state.threadId, JSON.parse(JSON.stringify(state)));
  }

  list(): string[] {
    return [...this.threads.keys()];
  }
}
