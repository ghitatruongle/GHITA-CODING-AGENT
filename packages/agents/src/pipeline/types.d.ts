export interface RunnableConfig {
    /** Name tag for the runnable */
    name?: string;
    /** Maximum retries on failure */
    maxRetries?: number;
    /** Delay between retries in ms */
    retryDelay?: number;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Custom metadata */
    metadata?: Record<string, unknown>;
    /** Tags for filtering/identification */
    tags?: string[];
}
export interface StreamChunk<T> {
    /** Incremental data */
    data: T;
    /** Whether this is the final chunk */
    done: boolean;
    /** Chunk index */
    index: number;
}
export type RunnableInput<I> = I | AsyncIterable<I>;
export interface TransformFn<I, O> {
    (input: I, config?: RunnableConfig): O | Promise<O>;
}
export interface StreamTransformFn<I, O> {
    (input: AsyncIterable<I>, config?: RunnableConfig): AsyncIterable<O>;
}
//# sourceMappingURL=types.d.ts.map