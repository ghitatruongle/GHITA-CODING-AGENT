// ==============================================================================
// GHITA CODING AGENT - Request Batching Types (Phase 27)
// Token-efficient prompt concatenation + parallel provider execution
// ==============================================================================

import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse } from '../types.js';

// ---------------------------------------------------------------------------
// Batching Strategies
// ---------------------------------------------------------------------------

/**
 * Strategy for grouping multiple requests into a single batch.
 * - 'none': every request is sent independently (no batching)
 * - 'time-window': requests received within `windowMs` are batched together
 * - 'size-window': requests are flushed when batch reaches `maxBatchSize`
 * - 'hybrid': flushed when EITHER window expires or size threshold reached
 */
export type BatchingStrategy = 'none' | 'time-window' | 'size-window' | 'hybrid';

// ---------------------------------------------------------------------------
// Concatenation Strategy
// ---------------------------------------------------------------------------

/**
 * How to merge multiple chat requests into one prompt for token efficiency.
 * - 'sequential': join prompts with explicit separators
 * - 'numbered': "Request 1: ...\n---\nRequest 2: ..."
 * - 'jsonl': each request as a JSON line (best for parallel decoders)
 * - 'xml-tags': wrap in <request id="..."> blocks
 */
export type ConcatenationStrategy = 'sequential' | 'numbered' | 'jsonl' | 'xml-tags';

// ---------------------------------------------------------------------------
// Batch Configuration
// ---------------------------------------------------------------------------

export interface BatchEngineConfig {
  /** Batching strategy (default: 'hybrid') */
  strategy: BatchingStrategy;
  /** Max batch size (default: 8) */
  maxBatchSize: number;
  /** Time window in ms before flushing partial batch (default: 50ms) */
  windowMs: number;
  /** Concatenation strategy (default: 'numbered') */
  concatenation: ConcatenationStrategy;
  /** Max tokens per concatenated prompt (default: 8000) */
  maxTokensPerPrompt: number;
  /** Whether to run requests in parallel across providers (default: true) */
  parallelExecution: boolean;
  /** Max parallel executions (default: 5) */
  maxParallel: number;
  /** Track per-batch cost in cost tracker (default: true) */
  trackCost: true;
  /** Auto-flush on error so other requests aren't blocked (default: true) */
  autoFlushOnError: boolean;
}

export const DEFAULT_BATCH_CONFIG: Required<BatchEngineConfig> = {
  strategy: 'hybrid',
  maxBatchSize: 8,
  windowMs: 50,
  concatenation: 'numbered',
  maxTokensPerPrompt: 8000,
  parallelExecution: true,
  maxParallel: 5,
  trackCost: true,
  autoFlushOnError: true,
};

// ---------------------------------------------------------------------------
// Batch Request/Response Types
// ---------------------------------------------------------------------------

/** A single request to be batched. */
export interface BatchRequest {
  id: string;
  provider: AIProviderType;
  model?: string;
  messages: ChatMessage[];
  options?: ChatOptions;
  /** Optional tag for grouping (requests with same tag are batched together) */
  tag?: string;
  /** Optional priority (higher = processed first) */
  priority?: number;
  /** Timestamp when the request was enqueued */
  enqueuedAt: number;
}

/** Result for a single request in a batch. */
export interface BatchRequestResult {
  id: string;
  ok: boolean;
  response?: ChatResponse;
  chunks?: AsyncGenerator<AIStreamChunk>;
  error?: Error;
  /** Time spent in queue (ms) */
  queueLatencyMs: number;
  /** Time spent in provider call (ms) */
  providerLatencyMs: number;
  /** Total time from enqueue to result (ms) */
  totalLatencyMs: number;
  /** Number of input tokens (if available) */
  promptTokens?: number;
  /** Number of output tokens (if available) */
  completionTokens?: number;
  /** Cost in USD (estimated) */
  costUsd?: number;
}

/** A single concatenated prompt that is sent to the provider. */
export interface ConcatenatedPrompt {
  tag: string;
  provider: AIProviderType;
  model?: string;
  /** Original requests in the batch */
  requests: BatchRequest[];
  /** The single concatenated message list sent to the provider */
  messages: ChatMessage[];
  /** Estimated total tokens of the concatenated prompt */
  estimatedTokens: number;
  /** Number of tokens saved vs. sending requests individually */
  tokensSaved: number;
  /** Token savings as a percentage (0-1) */
  savingsRatio: number;
}

/** A batch that has been flushed (sent to a provider). */
export interface BatchExecution {
  batchId: string;
  tag: string;
  provider: AIProviderType;
  model?: string;
  /** Number of requests in the batch */
  size: number;
  /** Concatenation strategy used */
  concatenation: ConcatenationStrategy;
  /** Estimated token cost */
  estimatedTokens: number;
  tokensSaved: number;
  savingsRatio: number;
  /** When the batch was flushed */
  flushedAt: number;
  /** Latency from first request enqueue to flush */
  windowLatencyMs: number;
  /** Results for each request */
  results: BatchRequestResult[];
  /** Per-batch total cost (USD) */
  totalCostUsd: number;
  /** Wall-clock duration of provider call */
  providerLatencyMs: number;
}

// ---------------------------------------------------------------------------
// Cost Tracking
// ---------------------------------------------------------------------------

export interface BatchCostEntry {
  batchId: string;
  provider: AIProviderType;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  timestamp: number;
  /** Tokens saved by batching (optional) */
  tokensSaved?: number;
  /** Savings ratio 0-1 (optional) */
  savingsRatio?: number;
}

export interface BatchCostSummary {
  totalBatches: number;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  averageCostPerBatch: number;
  averageCostPerRequest: number;
  /** Tokens saved by batching */
  totalTokensSaved: number;
  /** Average savings ratio (0-1) */
  averageSavingsRatio: number;
  /** Per-provider breakdown */
  byProvider: Record<
    string,
    {
      batches: number;
      requests: number;
      costUsd: number;
      tokens: number;
    }
  >;
}

// ---------------------------------------------------------------------------
// Batch Engine Statistics
// ---------------------------------------------------------------------------

export interface BatchEngineStats {
  /** Total requests received */
  totalRequests: number;
  /** Total batches executed */
  totalBatches: number;
  /** Average batch size */
  averageBatchSize: number;
  /** Current queue depth */
  queueDepth: number;
  /** Number of currently-executing batches */
  inFlight: number;
  /** Number of failed requests */
  failedRequests: number;
  /** Total tokens processed */
  totalTokens: number;
  /** Total tokens saved via batching */
  totalTokensSaved: number;
  /** Savings ratio (0-1) */
  savingsRatio: number;
  /** Time since engine started */
  uptimeMs: number;
}

// ---------------------------------------------------------------------------
// Batch Provider Adapter Interface
// ---------------------------------------------------------------------------

/**
 * Interface a provider adapter must implement to be used with the batcher.
 * Mirrors the relevant parts of AIProvider so we don't depend on the full
 * registry here (caller wires it up).
 */
export interface BatchProviderAdapter {
  /** Provider type identifier */
  readonly type: AIProviderType;
  /** Send a (possibly concatenated) prompt to the provider */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  /** Stream a (possibly concatenated) prompt */
  chatStream?(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
  /** Optional cost estimator (USD per 1K tokens, input/output) */
  estimateCost?(promptTokens: number, completionTokens: number, model?: string): number;
}

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type BatchEvent =
  | { type: 'enqueued'; request: BatchRequest; queueDepth: number }
  | { type: 'flushed'; batch: BatchExecution }
  | { type: 'completed'; batch: BatchExecution }
  | { type: 'failed'; batchId: string; requestId: string; error: Error }
  | { type: 'queue-drained'; remaining: number };

export type BatchEventListener = (event: BatchEvent) => void;
