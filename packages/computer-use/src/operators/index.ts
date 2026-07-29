// ==============================================================================
// GHITA CODING AGENT - Operator Barrel (Phase 1 Rust Rewrite)
// ==============================================================================

export * from './types.js';
export {
  MAX_EDGE_DEFAULT,
  buildScreenshotBundle,
  mockScreenshot,
  resizeIfNeeded,
  undoDpiScale,
} from './utils.js';
export {
  TauriOperator,
  createTauriAdapter,
  isTauriAvailable,
  tryCreateTauriOperator,
} from './tauri.js';
export {
  DEFAULT_ITERATION_TIMEOUT_MS,
  DEFAULT_LOOP_TIMEOUT_MS,
  DEFAULT_MAX_ITERATIONS,
  runReActLoop,
  type ParsedAction as ReActParsedAction,
  type ReActModelAdapter,
  type ReActModelRequest,
  type ReActOptions,
} from './reactLoop.js';

// v0.4.9 A7: GUI grounding + retry
export {
  verifyCoordinate,
  withActionRetry,
  annotateAction,
  type Point,
  type GroundingResult,
  type RetryOptions,
  type RetryOutcome,
  type StepAnnotation,
} from './grounding.js';
