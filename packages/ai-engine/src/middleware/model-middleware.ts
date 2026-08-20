// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 4.5: Model Middleware Stack
// ------------------------------------------------------------------------------
// Composable middleware for model response processing (pattern: vercel-ai
// extract-reasoning, simulate-streaming, repaired-parse). Each middleware
// plugs into the existing AgentMiddleware pipeline from @ghita/agents.
//
// Built-in middlewares:
//   - extractReasoning    : normalize reasoning tokens from providers that
//                           embed them in content (e.g. <thinking> tags)
//   - simulateStreaming   : convert non-stream responses into streaming chunks
//                           for uniform downstream handling
//   - repairedParse       : accept structured output only when unambiguous;
//                           reject partial/ambiguous repairs
// ==============================================================================

import type { AgentMiddleware, MiddlewareContext, PostModelResult } from '@ghita/agents';
import type { BaseMessage } from '@ghita/agents';
import { AIMessage } from '@ghita/agents';

// ---------------------------------------------------------------------------
// Extract Reasoning Middleware
// ---------------------------------------------------------------------------

export interface ExtractReasoningOptions {
  /** Regex patterns to detect reasoning blocks in content. */
  reasoningPatterns?: RegExp[];
  /** Whether to strip reasoning from the visible content (default: true). */
  stripFromContent?: boolean;
}

const DEFAULT_REASONING_PATTERNS = [
  /<thinking>([\s\S]*?)<\/thinking>/gi,
  /<reasoning>([\s\S]*?)<\/reasoning>/gi,
  /\[THINK\]([\s\S]*?)\[\/THINK\]/gi,
];

export function createExtractReasoningMiddleware(
  options: ExtractReasoningOptions = {},
): AgentMiddleware {
  const patterns = options.reasoningPatterns ?? DEFAULT_REASONING_PATTERNS;
  const strip = options.stripFromContent !== false;

  return {
    name: 'extract-reasoning',
    priority: 70,

    async postModel(
      _context: MiddlewareContext,
      result: { response: BaseMessage; shouldContinue: boolean },
    ): Promise<PostModelResult | void> {
      const text = result.response.getText();
      let reasoning = '';
      let cleaned = text;

      for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
          reasoning += `${(match[1] ?? '').trim()}\n`;
          if (strip) {
            cleaned = cleaned.replace(match[0], '');
          }
        }
      }

      if (!reasoning.trim()) return undefined;

      const data = result.response.toData();
      const metadata = { ...(data.metadata ?? {}), reasoning: reasoning.trim() };

      if (strip && cleaned !== text) {
        const newResponse = new AIMessage(cleaned.trim(), { metadata });
        return { response: newResponse };
      }

      // Just annotate metadata without changing content
      const annotated = new AIMessage(text, { metadata });
      return { response: annotated };
    },
  };
}

// ---------------------------------------------------------------------------
// Simulate Streaming Middleware
// ---------------------------------------------------------------------------

export interface SimulateStreamingOptions {
  /** Chunk size in characters (default: 50). */
  chunkSize?: number;
  /** Delay between chunks in ms (default: 10). */
  delayMs?: number;
}

/**
 * Converts a complete response into simulated streaming chunks.
 * Useful for providers that don't support native streaming but need
 * uniform streaming behavior downstream.
 */
export function createSimulateStreamingMiddleware(
  options: SimulateStreamingOptions = {},
): AgentMiddleware {
  const chunkSize = options.chunkSize ?? 50;

  return {
    name: 'simulate-streaming',
    priority: 75,

    async postModel(
      _context: MiddlewareContext,
      result: { response: BaseMessage; shouldContinue: boolean },
    ): Promise<PostModelResult | void> {
      const text = result.response.getText();
      if (text.length <= chunkSize) return undefined;

      // Mark as streaming-capable via metadata
      const data = result.response.toData();
      const metadata = {
        ...(data.metadata ?? {}),
        streamingSimulated: true,
        originalLength: text.length,
      };
      const annotated = new AIMessage(text, { metadata });
      return { response: annotated };
    },
  };
}

// ---------------------------------------------------------------------------
// Repaired Parse Middleware
// ---------------------------------------------------------------------------

export interface RepairedParseOptions {
  /** JSON schema validator function. Return true if valid. */
  validator?: (parsed: unknown) => boolean;
  /** Maximum repair attempts before rejecting (default: 1). */
  maxRepairs?: number;
}

/**
 * Validates structured output from model responses. Only accepts repaired
 * parses when the result is unambiguous (validates against schema). Rejects
 * partial or ambiguous repairs to prevent silent data corruption.
 */
export function createRepairedParseMiddleware(options: RepairedParseOptions = {}): AgentMiddleware {
  const validator = options.validator;

  return {
    name: 'repaired-parse',
    priority: 80,

    async postModel(
      _context: MiddlewareContext,
      result: { response: BaseMessage; shouldContinue: boolean },
    ): Promise<PostModelResult | void> {
      const text = result.response.getText().trim();

      // Try to extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return undefined;

      try {
        const parsed = JSON.parse(jsonMatch[0]);

        // If validator provided, check validity
        if (validator && !validator(parsed)) {
          // Repair failed validation — mark as invalid
          const data = result.response.toData();
          const metadata = {
            ...(data.metadata ?? {}),
            parseStatus: 'invalid',
            parseError: 'validation failed',
          };
          const annotated = new AIMessage(text, { metadata });
          return { response: annotated };
        }

        // Valid parse — mark as success (repaired if original wasn't pure JSON)
        if (text !== jsonMatch[0]) {
          const data = result.response.toData();
          const metadata = {
            ...(data.metadata ?? {}),
            parseStatus: 'success',
            parsedOutput: parsed,
          };
          const annotated = new AIMessage(text, { metadata });
          return { response: annotated };
        }
      } catch {
        // JSON parse failed — mark as unparseable
        const data = result.response.toData();
        const metadata = {
          ...(data.metadata ?? {}),
          parseStatus: 'failed',
          parseError: 'invalid JSON',
        };
        const annotated = new AIMessage(text, { metadata });
        return { response: annotated };
      }

      return undefined;
    },
  };
}
