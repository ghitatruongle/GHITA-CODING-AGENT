// ==============================================================================
// GHITA CODING AGENT - ReAct Loop (Phase 18: Screenshot Pipeline)
// ==============================================================================
//
// The ReAct loop is the orchestration layer that ties the Operator, the
// multimodal LLM, and the ActionParser together. On every iteration it:
//
//   1. Captures a fresh screenshot.
//   2. Builds a prompt that includes the user goal, the previous steps, and
//      the new screenshot (sent as a base64 data URL).
//   3. Calls the model adapter and parses the result through ActionParser.
//   4. Dispatches the action through the Operator.
//   5. Records the iteration as a ReActStep and loops.
//
// The loop terminates when:
//   - The model returns a `finished` / `None` action (stopReason='completed')
//   - The iteration count reaches maxIterations (stopReason='max-iterations')
//   - An unknown action_type is emitted (stopReason='unsupported')
//   - The operator throws (stopReason='error')
//
// The model adapter is injected as a function so the loop has no hard
// dependency on a particular LLM SDK — this matches the rest of the
// codebase (skills, computer-use, vision) which all use small typed
// contracts instead of pulling in framework globals.
// ==============================================================================

import type {
  Operator,
  OperatorContext,
  ReActRunResult,
  ReActStep,
  ReActStopReason,
} from './types.js';
import type { ScreenCapture, ScreenSize } from '../index.js';
import { ActionParser } from '../actionParser.js';
import { buildScreenshotBundle, mockScreenshot } from './utils.js';

export const DEFAULT_MAX_ITERATIONS = 25;
export const DEFAULT_ITERATION_TIMEOUT_MS = 60_000;
export const DEFAULT_LOOP_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

export interface ReActModelRequest {
  goal: string;
  screenshot: ScreenCapture;
  history: ReActStep[];
}

export type ReActModelAdapter = (
  req: ReActModelRequest,
) => Promise<{ rawPrediction: string; thought: string }>;

export interface ReActOptions {
  /** Initial natural-language goal for the model. */
  goal: string;
  /** Adapter that calls the multimodal LLM. */
  model: ReActModelAdapter;
  /** Underlying input/output driver. */
  operator: Operator;
  /** Optional context (region, scale, maxEdge). */
  context?: OperatorContext;
  /** Safety cap; default 25. */
  maxIterations?: number;
  /** Per-iteration timeout in ms; default 60_000. */
  iterationTimeoutMs?: number;
  /** Whole-loop timeout in ms; default 5 * 60_000. */
  loopTimeoutMs?: number;
  /** Abort signal for external cancellation. */
  signal?: AbortSignal;
  /** Called once per step BEFORE action execution (for UI streaming). */
  onStep?: (step: ReActStep) => void;
}

export interface ParsedAction {
  type: string;
  inputs: Record<string, unknown>;
  raw: Record<string, unknown>;
}

/** Normalise ActionParser output into the Operator-friendly shape. */
function parsePrediction(raw: string, screenSize: ScreenSize | undefined): ParsedAction[] {
  if (!raw || typeof raw !== 'string') return [];
  const factor = 1000;
  const parsed = ActionParser.parse({
    prediction: raw,
    factor,
    screenContext: screenSize ? { width: screenSize.width, height: screenSize.height } : undefined,
  });
  return parsed.map((p) => ({
    type: String(p.action_type ?? '').toLowerCase(),
    inputs: (p.action_inputs ?? {}) as Record<string, unknown>,
    raw: p as unknown as Record<string, unknown>,
  }));
}

const TERMINAL_ACTIONS = new Set(['finished', 'finish', 'none', 'done', 'stop', 'answer']);

function dispatchAction(
  operator: Operator,
  action: ParsedAction,
  screenSize: ScreenSize | undefined,
): Promise<void> {
  const inputs = action.inputs;
  switch (action.type) {
    case 'click': {
      const pt = extractPoint(inputs, screenSize);
      if (!pt) throw new Error('Missing or invalid coordinates for click');
      return operator.click(pt);
    }
    case 'left_click':
    case 'leftclick': {
      const pt = extractPoint(inputs, screenSize);
      if (!pt) throw new Error('Missing or invalid coordinates for left_click');
      return operator.click(pt, 'left');
    }
    case 'right_click':
    case 'rightclick': {
      const pt = extractPoint(inputs, screenSize);
      if (!pt) throw new Error('Missing or invalid coordinates for right_click');
      return operator.click(pt, 'right');
    }
    case 'double_click':
    case 'doubleclick': {
      const pt = extractPoint(inputs, screenSize);
      if (!pt) throw new Error('Missing or invalid coordinates for double_click');
      return operator.click(pt, 'left').then(() => operator.click(pt, 'left'));
    }
    case 'move_mouse':
    case 'movemouse': {
      const pt = extractPoint(inputs, screenSize);
      if (!pt) throw new Error('Missing or invalid coordinates for move_mouse');
      return operator.moveMouse(pt);
    }
    case 'type':
    case 'type_text':
    case 'typetext': {
      const text = String(inputs.text ?? '');
      return operator.typeText(text);
    }
    case 'press_key':
    case 'presskey':
    case 'key': {
      const key = String(inputs.key ?? inputs.text ?? '');
      return operator.pressKey(key);
    }
    case 'screenshot':
    case 'wait': {
      // Pure observation actions; nothing to dispatch.
      return Promise.resolve();
    }
    default:
      throw new Error(`Unsupported action_type: "${action.type}"`);
  }
}

function extractPoint(
  inputs: Record<string, unknown>,
  screenSize: ScreenSize | undefined,
): { x: number; y: number } | undefined {
  const startBox = inputs.start_box;
  const startCoords = inputs.start_coords;
  if (Array.isArray(startCoords) && startCoords.length >= 2) {
    const [x, y] = startCoords;
    if (typeof x === 'number' && typeof y === 'number') return { x, y };
  }
  if (typeof startBox === 'string') {
    try {
      const coords = JSON.parse(startBox) as number[];
      if (Array.isArray(coords) && coords.length >= 2) {
        const [x1 = 0, y1 = 0, x2 = x1, y2 = y1] = coords;
        if (screenSize) {
          return {
            x: Math.round(((x1 + x2) / 2) * screenSize.width),
            y: Math.round(((y1 + y2) / 2) * screenSize.height),
          };
        }
        return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      }
    } catch {
      // ignore — fall through to undefined
    }
  }
  return undefined;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function runReActLoop(options: ReActOptions): Promise<ReActRunResult> {
  const {
    goal,
    model,
    operator,
    context,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    iterationTimeoutMs = DEFAULT_ITERATION_TIMEOUT_MS,
    loopTimeoutMs = DEFAULT_LOOP_TIMEOUT_MS,
    signal,
    onStep,
  } = options;

  const startedAt = Date.now();
  const steps: ReActStep[] = [];
  let stopReason: ReActStopReason = 'completed';

  // Track the loop guard timer so we can clean it up on normal completion.
  let loopGuardTimer: ReturnType<typeof setTimeout> | undefined;
  let loopGuardAbortCleanup: (() => void) | undefined;

  const loopGuard = new Promise<never>((_, reject) => {
    loopGuardTimer = setTimeout(
      () => reject(new Error(`ReAct loop timed out after ${loopTimeoutMs}ms`)),
      loopTimeoutMs,
    );
    if (signal) {
      const onAbort = () => {
        clearTimeout(loopGuardTimer);
        reject(new Error('ReAct loop aborted by signal'));
      };
      if (signal.aborted) onAbort();
      else {
        signal.addEventListener('abort', onAbort, { once: true });
        loopGuardAbortCleanup = () => signal.removeEventListener('abort', onAbort);
      }
    }
  });
  // Suppress unhandled rejection — the timer is always cleaned up in the
  // finally block below, so the reject callback will never fire after cleanup.
  loopGuard.catch(() => {});

  const cleanupLoopGuard = () => {
    if (loopGuardTimer !== undefined) {
      clearTimeout(loopGuardTimer);
      loopGuardTimer = undefined;
    }
    loopGuardAbortCleanup?.();
    loopGuardAbortCleanup = undefined;
  };

  const iteration = async (i: number): Promise<void> => {
    if (Date.now() - startedAt > loopTimeoutMs) {
      stopReason = 'max-iterations';
      return;
    }
    if (signal?.aborted) {
      stopReason = 'error';
      return;
    }

    let screenshot: ScreenCapture;
    let size: ScreenSize | undefined;
    try {
      const bundle = await buildScreenshotBundle(operator, context);
      screenshot = bundle.capture;
      size = bundle.size;
    } catch (e) {
      screenshot = await mockScreenshot();
      size = screenshot.size;
    }

    let prediction: { rawPrediction: string; thought: string };
    try {
      prediction = await withTimeout(
        model({ goal, screenshot, history: steps }),
        iterationTimeoutMs,
        `model call (iteration ${i})`,
      );
    } catch (e) {
      stopReason = 'error';
      steps.push({
        iteration: i,
        thought: 'model adapter failed',
        action: { type: 'error', inputs: {} },
        success: false,
        error: (e as Error).message,
        durationMs: 0,
      });
      const lastStep = steps[steps.length - 1];
      if (lastStep) onStep?.(lastStep);
      return;
    }

    const actions = parsePrediction(prediction.rawPrediction, size);
    if (actions.length === 0) {
      stopReason = 'unsupported';
      const step: ReActStep = {
        iteration: i,
        thought: prediction.thought,
        action: { type: 'unknown', inputs: { raw: prediction.rawPrediction } },
        success: false,
        error: 'ActionParser returned no actions',
        durationMs: 0,
        observation: { capture: screenshot, capturedAt: Date.now() },
      };
      steps.push(step);
      onStep?.(step);
      return;
    }

    const first = actions[0];
    if (!first) return;
    if (TERMINAL_ACTIONS.has(first.type)) {
      stopReason = 'completed';
      const step: ReActStep = {
        iteration: i,
        thought: prediction.thought,
        action: { type: first.type, inputs: first.inputs },
        success: true,
        durationMs: 0,
        observation: { capture: screenshot, capturedAt: Date.now() },
      };
      steps.push(step);
      onStep?.(step);
      return;
    }

    const iterStart = Date.now();
    let success = true;
    let error: string | undefined;
    try {
      await withTimeout(
        dispatchAction(operator, first, size),
        iterationTimeoutMs,
        `action ${first.type} (iteration ${i})`,
      );
    } catch (e) {
      success = false;
      error = (e as Error).message;
      stopReason = 'unsupported';
    }
    const step: ReActStep = {
      iteration: i,
      thought: prediction.thought,
      action: { type: first.type, inputs: first.inputs },
      success,
      error,
      durationMs: Date.now() - iterStart,
      observation: { capture: screenshot, capturedAt: Date.now() },
    };
    steps.push(step);
    onStep?.(step);
  };

  try {
    for (let i = 0; i < maxIterations; i++) {
      await iteration(i + 1);
      if (stopReason !== 'completed' || steps[steps.length - 1]?.action.type === 'finished') {
        break;
      }
    }
    if (steps.length >= maxIterations && stopReason === 'completed') {
      stopReason = 'max-iterations';
    }
  } catch (e) {
    stopReason = 'error';
    steps.push({
      iteration: steps.length + 1,
      thought: 'loop guard tripped',
      action: { type: 'error', inputs: { message: (e as Error).message } },
      success: false,
      error: (e as Error).message,
      durationMs: 0,
    });
  } finally {
    // Always clean up the loop guard timer to prevent 5-minute dangling timers.
    cleanupLoopGuard();
  }

  return {
    steps,
    stopReason,
    totalIterations: steps.length,
    startedAt,
    finishedAt: Date.now(),
  };
}
