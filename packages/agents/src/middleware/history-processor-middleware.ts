// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 2.2: History Processor Middleware
// ------------------------------------------------------------------------------
// Adapter that plugs a HistoryProcessor pipeline into the existing
// AgentMiddleware.preModel hook. The processors run synchronously on the
// message list before it reaches the LLM; the original messages array is not
// mutated (processors return a new list).
// ==============================================================================

import type { AgentMiddleware, MiddlewareContext, PreModelResult } from './types.js';
import type { HistoryProcessor, ProcessorContext } from './history-processors.js';
import { applyHistoryProcessors } from './history-processors.js';

export interface HistoryProcessorMiddlewareOptions {
  /** Ordered list of processors to apply before every model call. */
  processors: HistoryProcessor[];
  /** Optional char budget forwarded to processors (e.g. truncateByTokens). */
  charBudget?: number;
}

/**
 * Create a middleware that applies history processors at preModel time.
 * Priority 50 — runs after policy/hooks (lower priority numbers) but before
 * most user-supplied middlewares (default priority 100).
 */
export function createHistoryProcessorMiddleware(
  options: HistoryProcessorMiddlewareOptions,
): AgentMiddleware {
  const { processors, charBudget } = options;

  return {
    name: 'history-processors',
    priority: 50,

    async preModel(context: MiddlewareContext): Promise<PreModelResult | void> {
      if (processors.length === 0) return undefined;

      const iteration =
        typeof context.metadata?.iteration === 'number'
          ? (context.metadata.iteration as number)
          : 0;
      const maxIterations =
        typeof context.metadata?.maxIterations === 'number'
          ? (context.metadata.maxIterations as number)
          : 10;

      const ctx: ProcessorContext = { iteration, maxIterations, charBudget };
      const processed = applyHistoryProcessors(context.messages, processors, ctx);

      // Only signal a change when the list actually differs (avoids unnecessary
      // downstream clones when processors are no-ops for this turn).
      if (processed === context.messages || processed.length === context.messages.length) {
        // Length-equal but content may differ (e.g. tagToolCalls mutates metadata).
        // Always return the processed list so metadata annotations propagate.
        if (processed === context.messages) return undefined;
      }

      return { messages: processed };
    },
  };
}
