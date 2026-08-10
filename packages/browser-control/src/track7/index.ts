// ==============================================================================
// GHITA CODING AGENT - Browser v1.1.0 Track 7: public entry
// ==============================================================================

export { ActionRegistry, BUILTIN_ACTIONS } from './action-registry.js';
export type { ActionDefinition, ActionRegistryOptions } from './action-registry.js';

export { ActCache, actCacheKey, domSignature } from './act-cache.js';
export type { ActCacheEntry, ActCacheOptions } from './act-cache.js';

export { DEFAULT_ACT_VERIFIER, classifyActError, runActionWithRetry } from './verifier.js';
export type {
  ActOutcome,
  ActError,
  ActErrorCategory,
  ActEvidence,
  ActVerifier,
  RetryPolicy,
  RetryResult,
} from './verifier.js';

export { NetworkInterceptor } from './network.js';
export type { NetworkRequest, RequestMethod, InterceptDecision, BlockRule } from './network.js';

export { MemoryTraceStore, toTimelineView, summarizeTraces } from './trace.js';
export type { ActionTrace, TraceStore, TimelineEvent } from './trace.js';
