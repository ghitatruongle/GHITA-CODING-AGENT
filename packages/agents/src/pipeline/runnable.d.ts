import type { RunnableConfig, StreamChunk, TransformFn } from './types.js';
/**
 * Abstract base class for composable pipeline units.
 * Inspired by LangChain's Runnable pattern.
 */
export declare abstract class Runnable<I, O> {
    abstract readonly name: string;
    /** Execute with a single input */
    abstract invoke(input: I, config?: RunnableConfig): Promise<O>;
    /** Execute with multiple inputs in parallel */
    batch(inputs: I[], config?: RunnableConfig): Promise<O[]>;
    /** Stream output chunks */
    stream(input: I, config?: RunnableConfig): AsyncGenerator<StreamChunk<O>>;
    /** Transform this runnable's output through another function */
    transform<NewO>(fn: TransformFn<O, NewO>): Runnable<I, NewO>;
    /** Chain this runnable with another (pipe) */
    pipe<NewO>(next: Runnable<O, NewO>): Runnable<I, NewO>;
    /** Add retry logic */
    withRetry(maxRetries?: number, retryDelay?: number): Runnable<I, O>;
    /** Add fallback runnables */
    withFallbacks(fallbacks: Runnable<I, O>[]): Runnable<I, O>;
    /** Bind config defaults */
    withConfig(config: Partial<RunnableConfig>): Runnable<I, O>;
}
/** Wraps a function as a Runnable */
export declare class LambdaRunnable<I, O> extends Runnable<I, O> {
    readonly name: string;
    private readonly fn;
    constructor(fn: TransformFn<I, O>, name?: string);
    invoke(input: I, config?: RunnableConfig): Promise<O>;
}
/** Creates a Runnable from a plain function */
export declare function runnable<I, O>(fn: TransformFn<I, O>, name?: string): Runnable<I, O>;
/** Sequence: runs runnables in order, passing output as input to next */
export declare function sequence<I, O>(...runnables: Runnable<any, any>[]): Runnable<I, O>;
/** Parallel: runs all runnables with the same input, returns array of results */
export declare function parallel<I, O>(...runnables: Runnable<I, O>[]): Runnable<I, O[]>;
//# sourceMappingURL=runnable.d.ts.map