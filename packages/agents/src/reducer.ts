// Pure function (state, event) -> state for agent run reconstruction (pattern:
// 12-factor-agents Factor 12). Given an initial state and an ordered event log,
// the reducer replays every event deterministically to reconstruct the final
// state. This enables crash recovery, eval replay, and fanout swarm
// reproducibility without storing full snapshots at every step.

/** Events that mutate agent run state. */
export type AgentRunEvent =
  | { type: 'session_start'; agentId: string; userMessage: string; timestamp: number }
  | {
      type: 'tool_call';
      toolCallId: string;
      tool: string;
      input: Record<string, unknown>;
      timestamp: number;
    }
  | {
      type: 'tool_result';
      toolCallId: string;
      tool: string;
      observation: string;
      timestamp: number;
    }
  | {
      type: 'model_response';
      content: string;
      toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
      timestamp: number;
    }
  | { type: 'iteration_complete'; iteration: number; timestamp: number }
  | { type: 'run_complete'; output: string; timestamp: number }
  | { type: 'run_error'; error: string; timestamp: number };

/** Serializable snapshot of an agent run at any point in time. */
export interface AgentRunState {
  agentId: string | null;
  userMessage: string | null;
  iterations: number;
  steps: Array<{
    toolCallId: string;
    tool: string;
    input: Record<string, unknown>;
    observation: string | null;
  }>;
  modelResponses: Array<{ content: string; timestamp: number }>;
  status: 'idle' | 'running' | 'completed' | 'error';
  output: string | null;
  error: string | null;
  lastTimestamp: number;
}

/** The initial empty state before any events are applied. */
export function createInitialState(): AgentRunState {
  return {
    agentId: null,
    userMessage: null,
    iterations: 0,
    steps: [],
    modelResponses: [],
    status: 'idle',
    output: null,
    error: null,
    lastTimestamp: 0,
  };
}

/**
 * Pure reducer: applies a single event to produce the next state.
 * No side effects, no mutation of the input state.
 */
export function agentRunReducer(state: AgentRunState, event: AgentRunEvent): AgentRunState {
  const next: AgentRunState = {
    ...state,
    lastTimestamp: Math.max(state.lastTimestamp, event.timestamp),
  };

  switch (event.type) {
    case 'session_start':
      next.agentId = event.agentId;
      next.userMessage = event.userMessage;
      next.status = 'running';
      return next;

    case 'tool_call':
      next.steps = [
        ...state.steps,
        {
          toolCallId: event.toolCallId,
          tool: event.tool,
          input: event.input,
          observation: null,
        },
      ];
      return next;

    case 'tool_result': {
      next.steps = state.steps.map((step) =>
        step.toolCallId === event.toolCallId ? { ...step, observation: event.observation } : step,
      );
      return next;
    }

    case 'model_response':
      next.modelResponses = [
        ...state.modelResponses,
        { content: event.content, timestamp: event.timestamp },
      ];
      return next;

    case 'iteration_complete':
      next.iterations = event.iteration + 1;
      return next;

    case 'run_complete':
      next.status = 'completed';
      next.output = event.output;
      return next;

    case 'run_error':
      next.status = 'error';
      next.error = event.error;
      return next;

    default:
      return state;
  }
}

/** Replay an entire event log from initial state to reconstruct final state. */
export function replayEvents(events: AgentRunEvent[], initialState?: AgentRunState): AgentRunState {
  let state = initialState ?? createInitialState();
  for (const event of events) {
    state = agentRunReducer(state, event);
  }
  return state;
}
