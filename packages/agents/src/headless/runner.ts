// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 1.3: Headless / CI mode
// ------------------------------------------------------------------------------
// Runs a scripted agent task with no UI and emits a stable JSON-lines event
// stream (pattern: grok-build headless `--output-format streaming-json`).
// Exit codes: 0 = success · 1 = runtime error · 2 = run exhausted
// (max-turns reached without a final answer — the "findings exist" contract).
// ==============================================================================

import { createReActAgent } from '../react/agent.js';
import type { ReActAgentRunResult, ReActTool } from '../react/types.js';
import type { BaseMessage } from '../messages/message.js';

export type HeadlessOutputFormat = 'streaming-json' | 'text';

export interface HeadlessOptions {
  prompt: string;
  systemPrompt?: string;
  /** Hard cap on agent turns (default 10, mirrors ReAct maxIterations). */
  maxTurns?: number;
  tools?: ReActTool[];
  /** Restrict execution to this subset of tool names. */
  toolsAllowlist?: string[];
  /** Fork from an existing session id: the new run references the parent. */
  forkSession?: string;
  /** Explicit session id (generated when omitted). */
  sessionId?: string;
  outputFormat?: HeadlessOutputFormat;
}

export type HeadlessEventType =
  | 'session_start'
  | 'tool_call'
  | 'tool_result'
  | 'message'
  | 'turn_end'
  | 'done'
  | 'error';

export interface HeadlessEvent {
  type: HeadlessEventType;
  ts: number;
  sessionId: string;
  forkedFrom?: string;
  turn?: number;
  tool?: string;
  input?: Record<string, unknown>;
  output?: string;
  text?: string;
  error?: string;
  exitCode?: number;
}

export interface HeadlessResult {
  exitCode: number;
  events: HeadlessEvent[];
  /** Present when the run produced a result; null on error/exhaustion. */
  agentResult: ReActAgentRunResult | null;
}

export interface HeadlessDeps {
  /** Provider-agnostic LLM call — the CLI wires a real provider, tests a script. */
  llmCall: (messages: BaseMessage[]) => Promise<BaseMessage>;
  /** Event sink; defaults to JSON-lines on stdout when outputFormat is streaming-json. */
  emit?: (event: HeadlessEvent) => void;
  now?: () => number;
}

/** Exit-code contract: 0 success · 1 error · 2 exhausted (max turns, no answer). */

/**
 * Run one scripted agent task headlessly. Returns the collected event stream
 * plus the process exit code semantics.
 */
export async function runHeadless(
  options: HeadlessOptions,
  deps: HeadlessDeps,
): Promise<HeadlessResult> {
  const now = deps.now ?? Date.now;
  const events: HeadlessEvent[] = [];
  const format = options.outputFormat ?? 'streaming-json';
  const sessionId =
    options.sessionId ??
    `${options.forkSession ? `${options.forkSession}-fork` : 'headless'}-${now().toString(36)}`;

  const emit = (event: HeadlessEvent): void => {
    events.push(event);
    if (deps.emit) {
      deps.emit(event);
      return;
    }
    if (format === 'streaming-json') {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    }
  };

  const allowlist = options.toolsAllowlist;
  const tools = (options.tools ?? []).filter((tool) => !allowlist || allowlist.includes(tool.name));

  let turn = 0;
  let agentResult: ReActAgentRunResult | undefined;
  let runError: Error | undefined;

  emit({
    type: 'session_start',
    ts: now(),
    sessionId,
    ...(options.forkSession ? { forkedFrom: options.forkSession } : {}),
    turn: 0,
  });

  try {
    const agent = createReActAgent({
      config: {
        name: 'headless',
        systemPrompt: options.systemPrompt,
        maxIterations: options.maxTurns ?? 10,
        tools,
        // Durable runs: max-turn exhaustion surfaces as ReActIterationLimitError
        // (exit 2) and the session id is stable across the event stream.
        runId: sessionId,
      },
      llmCall: async (messages) => {
        turn += 1;
        const response = await deps.llmCall(messages);
        emit({
          type: 'message',
          ts: now(),
          sessionId,
          turn,
          text: response.getText().slice(0, 2_000),
        });
        return response;
      },
    });

    agentResult = await agent.run(options.prompt, {
      onToolCall: (tool, input) => {
        emit({ type: 'tool_call', ts: now(), sessionId, turn, tool, input });
      },
      onToolResult: (tool, output) => {
        emit({ type: 'tool_result', ts: now(), sessionId, turn, tool, output });
      },
    });

    emit({
      type: 'turn_end',
      ts: now(),
      sessionId,
      turn,
      output: agentResult.output.slice(0, 2_000),
    });
  } catch (err) {
    runError = err instanceof Error ? err : new Error(String(err));
  }

  if (runError) {
    // Exhaustion (max-turns without final answer) is a findings-style stop,
    // not a crash: exit 2 keeps CI pipelines distinguishable from failures.
    const exhausted = runError.name === 'ReActIterationLimitError';
    const exitCode = exhausted ? 2 : 1;
    emit({
      type: 'error',
      ts: now(),
      sessionId,
      error: runError.message,
      exitCode,
    });
    emit({ type: 'done', ts: now(), sessionId, exitCode });
    if (format === 'text' && !deps.emit) {
      process.stderr.write(`${runError.message}\n`);
    }
    return { exitCode, events, agentResult: agentResult ?? null };
  }

  const result = agentResult as ReActAgentRunResult;
  const exitCode = result.output.trim().length > 0 ? 0 : 2;
  emit({ type: 'done', ts: now(), sessionId, exitCode });
  return { exitCode, events, agentResult: result };
}
