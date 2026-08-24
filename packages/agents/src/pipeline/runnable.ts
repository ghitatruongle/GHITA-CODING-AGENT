import type { RunnableConfig, StreamChunk, TransformFn } from './types.js';

function generateId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Abstract base class for composable pipeline units.
 * Inspired by LangChain's Runnable pattern.
 */
export abstract class Runnable<I, O> {
  abstract readonly name: string;

  /** Execute with a single input */
  abstract invoke(input: I, config?: RunnableConfig): Promise<O>;

  /** Execute with multiple inputs in parallel */
  async batch(inputs: I[], config?: RunnableConfig): Promise<O[]> {
    return Promise.all(inputs.map((input) => this.invoke(input, config)));
  }

  /** Stream output chunks */
  async *stream(input: I, config?: RunnableConfig): AsyncGenerator<StreamChunk<O>> {
    const result = await this.invoke(input, config);
    yield { data: result, done: true, index: 0 };
  }

  /** Transform this runnable's output through another function */
  transform<NewO>(fn: TransformFn<O, NewO>): Runnable<I, NewO> {
    return new TransformRunnable(this, fn);
  }

  /** Chain this runnable with another (pipe) */
  pipe<NewO>(next: Runnable<O, NewO>): Runnable<I, NewO> {
    return new PipeRunnable(this, next);
  }

  /** Add retry logic */
  withRetry(maxRetries = 3, retryDelay = 1000): Runnable<I, O> {
    return new RetryRunnable(this, maxRetries, retryDelay);
  }

  /** Add fallback runnables */
  withFallbacks(fallbacks: Runnable<I, O>[]): Runnable<I, O> {
    return new FallbackRunnable(this, fallbacks);
  }

  /** Bind config defaults */
  withConfig(config: Partial<RunnableConfig>): Runnable<I, O> {
    return new ConfigRunnable(this, config);
  }
}

/** Wraps a function as a Runnable */
export class LambdaRunnable<I, O> extends Runnable<I, O> {
  readonly name: string;
  private readonly fn: TransformFn<I, O>;

  constructor(fn: TransformFn<I, O>, name?: string) {
    super();
    this.fn = fn;
    this.name = name ?? `lambda_${generateId()}`;
  }

  async invoke(input: I, config?: RunnableConfig): Promise<O> {
    return this.fn(input, config);
  }
}

/** Pipes output of one runnable into another */
class PipeRunnable<I, M, O> extends Runnable<I, O> {
  readonly name: string;

  constructor(
    private readonly first: Runnable<I, M>,
    private readonly second: Runnable<M, O>,
  ) {
    super();
    this.name = `${first.name}→${second.name}`;
  }

  async invoke(input: I, config?: RunnableConfig): Promise<O> {
    const intermediate = await this.first.invoke(input, config);
    return this.second.invoke(intermediate, config);
  }

  async *stream(input: I, config?: RunnableConfig): AsyncGenerator<StreamChunk<O>> {
    const intermediate = await this.first.invoke(input, config);
    yield* this.second.stream(intermediate, config);
  }
}

/** Applies a transform function to the output */
class TransformRunnable<I, O, NewO> extends Runnable<I, NewO> {
  readonly name: string;

  constructor(
    private readonly source: Runnable<I, O>,
    private readonly fn: TransformFn<O, NewO>,
  ) {
    super();
    this.name = `${source.name}_transform`;
  }

  async invoke(input: I, config?: RunnableConfig): Promise<NewO> {
    const result = await this.source.invoke(input, config);
    return this.fn(result, config);
  }
}

/** Adds retry logic to a runnable */
class RetryRunnable<I, O> extends Runnable<I, O> {
  readonly name: string;

  constructor(
    private readonly source: Runnable<I, O>,
    private readonly maxRetries: number,
    private readonly retryDelay: number,
  ) {
    super();
    this.name = `${source.name}_retry`;
  }

  async invoke(input: I, config?: RunnableConfig): Promise<O> {
    const effectiveMaxRetries = config?.maxRetries ?? this.maxRetries;
    const effectiveDelay = config?.retryDelay ?? this.retryDelay;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
      try {
        return await this.source.invoke(input, config);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < effectiveMaxRetries) {
          await new Promise((r) => setTimeout(r, effectiveDelay * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }
}

/** Tries primary, then fallbacks on failure */
class FallbackRunnable<I, O> extends Runnable<I, O> {
  readonly name: string;

  constructor(
    private readonly primary: Runnable<I, O>,
    private readonly fallbacks: Runnable<I, O>[],
  ) {
    super();
    this.name = `${primary.name}_fallback`;
  }

  async invoke(input: I, config?: RunnableConfig): Promise<O> {
    const runnables = [this.primary, ...this.fallbacks];
    let lastError: Error | undefined;

    for (const runnable of runnables) {
      try {
        return await runnable.invoke(input, config);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError;
  }
}

/** Binds default config to a runnable */
class ConfigRunnable<I, O> extends Runnable<I, O> {
  readonly name: string;

  constructor(
    private readonly source: Runnable<I, O>,
    private readonly defaultConfig: Partial<RunnableConfig>,
  ) {
    super();
    this.name = source.name;
  }

  async invoke(input: I, config?: RunnableConfig): Promise<O> {
    const merged: RunnableConfig = { ...this.defaultConfig, ...config };
    return this.source.invoke(input, merged);
  }
}

/** Creates a Runnable from a plain function */
export function runnable<I, O>(fn: TransformFn<I, O>, name?: string): Runnable<I, O> {
  return new LambdaRunnable(fn, name);
}

/** Sequence: runs runnables in order, passing output as input to next */
export function sequence<I, O>(...runnables: Runnable<unknown, unknown>[]): Runnable<I, O> {
  if (runnables.length === 0) throw new Error('Sequence requires at least one runnable');
  return runnables.reduce((a, b) => a.pipe(b)) as Runnable<I, O>;
}

/** Parallel: runs all runnables with the same input, returns array of results */
export function parallel<I, O>(...runnables: Runnable<I, O>[]): Runnable<I, O[]> {
  return new LambdaRunnable(async (input: I, config?: RunnableConfig) => {
    return Promise.all(runnables.map((r) => r.invoke(input, config)));
  }, 'parallel');
}
