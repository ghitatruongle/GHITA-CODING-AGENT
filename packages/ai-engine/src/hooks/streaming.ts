// Pre/post generation hooks for LLM streaming pipeline.
// - HookContext: passed to each hook with metadata
// - HookPipeline: ordered list of hooks, runs pre and post events
// - Plugin hook interface: third-party plugins can register via registerHook()

import { StreamingBuffer } from './buffer.js';

export type HookPhase = 'pre-generation' | 'post-chunk' | 'post-generation' | 'on-error';

export interface HookContext {
  /** Session/thread ID */
  sessionId: string;
  /** Current phase being executed */
  phase: HookPhase;
  /** User prompt (pre-generation only) */
  prompt?: string;
  /** Model name (pre-generation only) */
  model?: string;
  /** Provider name (pre-generation only) */
  provider?: string;
  /** Accumulated text so far (post-chunk) */
  accumulated?: string;
  /** Latest chunk (post-chunk) */
  chunk?: string;
  /** Final response (post-generation) */
  response?: string;
  /** Token usage (post-generation) */
  tokens?: { input: number; output: number };
  /** Error (on-error) */
  error?: Error;
  /** Arbitrary metadata plugins can read/write */
  metadata: Record<string, unknown>;
  /** True if a hook calls this, pipeline halts after current hook */
  cancelled: boolean;
}

export interface Hook {
  /** Hook name (for logging) */
  name: string;
  /** Which phase this hook runs on */
  phase: HookPhase | HookPhase[];
  /** Priority (lower = runs first) */
  priority?: number;
  /** Hook function — may mutate ctx synchronously */
  run: (ctx: HookContext) => Promise<void> | void;
}

/**
 * StreamingPipeline — orchestrates a streaming LLM call with hook support.
 * - Pre-generation hooks can modify prompt or cancel
 * - Post-chunk hooks fire after each stream chunk
 * - Post-generation hooks fire after full response
 * - On-error hooks fire on any error
 */
export class StreamingPipeline {
  private readonly hooks: Hook[] = [];
  private readonly buffer: StreamingBuffer;

  constructor(buffer?: StreamingBuffer) {
    this.buffer = buffer ?? new StreamingBuffer();
  }

  /** Register a hook */
  registerHook(hook: Hook): void {
    this.hooks.push(hook);
    this.hooks.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /** Remove a hook by name */
  removeHook(name: string): boolean {
    const idx = this.hooks.findIndex((h) => h.name === name);
    if (idx === -1) return false;
    this.hooks.splice(idx, 1);
    return true;
  }

  /** List registered hooks */
  listHooks(): string[] {
    return this.hooks.map(
      (h) => `${h.name} (${Array.isArray(h.phase) ? h.phase.join('|') : h.phase})`,
    );
  }

  /** Run pre-generation hooks */
  async runPreGen(ctx: Omit<HookContext, 'phase' | 'cancelled'>): Promise<boolean> {
    return this.runPhase('pre-generation', {
      ...ctx,
      phase: 'pre-generation',
      cancelled: false,
    });
  }

  /** Run post-chunk hooks */
  async runPostChunk(ctx: Omit<HookContext, 'phase' | 'cancelled'>): Promise<boolean> {
    return this.runPhase('post-chunk', {
      ...ctx,
      phase: 'post-chunk',
      cancelled: false,
    });
  }

  /** Run post-generation hooks */
  async runPostGen(ctx: Omit<HookContext, 'phase' | 'cancelled'>): Promise<boolean> {
    return this.runPhase('post-generation', {
      ...ctx,
      phase: 'post-generation',
      cancelled: false,
    });
  }

  /** Run on-error hooks */
  async runOnError(ctx: Omit<HookContext, 'phase' | 'cancelled'>): Promise<boolean> {
    return this.runPhase('on-error', {
      ...ctx,
      phase: 'on-error',
      cancelled: false,
    });
  }

  /** Get the internal buffer (for testing) */
  getBuffer(): StreamingBuffer {
    return this.buffer;
  }

  private async runPhase(phase: HookPhase, ctx: HookContext): Promise<boolean> {
    const matching = this.hooks.filter((h) => {
      const phases = Array.isArray(h.phase) ? h.phase : [h.phase];
      return phases.includes(phase);
    });
    for (const hook of matching) {
      try {
        await hook.run(ctx);
      } catch (err) {
        // Hook errors should not crash the pipeline — log and continue

        console.error(`[hook ${hook.name}] error:`, err);
      }
      if (ctx.cancelled) return false;
    }
    return true;
  }
}

/**
 * Helper: stream chunks through the pipeline.
 * Yields each chunk after running post-chunk hooks.
 */
export async function* streamWithHooks(
  pipeline: StreamingPipeline,
  sessionId: string,
  chunks: AsyncIterable<string> | Iterable<string>,
  baseCtx: Partial<HookContext> = {},
): AsyncGenerator<string, void, void> {
  let accumulated = '';
  // Coalesce hook invocations into ~40ms batches: per-token middleware
  // multiplied its overhead across the whole stream. Consumers still receive
  // every chunk unchanged; hooks just see batched `chunk` payloads.
  const BATCH_MS = 40;
  let batchChunk = '';
  let lastFlush = Date.now();
  const flush = async (): Promise<boolean> => {
    const continueStream = await pipeline.runPostChunk({
      sessionId,
      chunk: batchChunk,
      accumulated,
      metadata: baseCtx.metadata ?? {},
    });
    batchChunk = '';
    lastFlush = Date.now();
    return continueStream;
  };
  for await (const chunk of chunks) {
    accumulated += chunk;
    batchChunk += chunk;
    if (Date.now() - lastFlush >= BATCH_MS) {
      if (!(await flush())) return;
    }
    yield chunk;
  }
  // Final partial batch — never drop the tail.
  if (batchChunk) {
    await flush();
  }
}
