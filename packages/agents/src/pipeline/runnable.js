// ==============================================================================
// GHITA CODING AGENT - Runnable Pipeline System
// ==============================================================================
function generateId() {
    return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
/**
 * Abstract base class for composable pipeline units.
 * Inspired by LangChain's Runnable pattern.
 */
export class Runnable {
    /** Execute with multiple inputs in parallel */
    async batch(inputs, config) {
        return Promise.all(inputs.map((input) => this.invoke(input, config)));
    }
    /** Stream output chunks */
    async *stream(input, config) {
        const result = await this.invoke(input, config);
        yield { data: result, done: true, index: 0 };
    }
    /** Transform this runnable's output through another function */
    transform(fn) {
        return new TransformRunnable(this, fn);
    }
    /** Chain this runnable with another (pipe) */
    pipe(next) {
        return new PipeRunnable(this, next);
    }
    /** Add retry logic */
    withRetry(maxRetries = 3, retryDelay = 1000) {
        return new RetryRunnable(this, maxRetries, retryDelay);
    }
    /** Add fallback runnables */
    withFallbacks(fallbacks) {
        return new FallbackRunnable(this, fallbacks);
    }
    /** Bind config defaults */
    withConfig(config) {
        return new ConfigRunnable(this, config);
    }
}
/** Wraps a function as a Runnable */
export class LambdaRunnable extends Runnable {
    name;
    fn;
    constructor(fn, name) {
        super();
        this.fn = fn;
        this.name = name ?? `lambda_${generateId()}`;
    }
    async invoke(input, config) {
        return this.fn(input, config);
    }
}
/** Pipes output of one runnable into another */
class PipeRunnable extends Runnable {
    first;
    second;
    name;
    constructor(first, second) {
        super();
        this.first = first;
        this.second = second;
        this.name = `${first.name}→${second.name}`;
    }
    async invoke(input, config) {
        const intermediate = await this.first.invoke(input, config);
        return this.second.invoke(intermediate, config);
    }
    async *stream(input, config) {
        const intermediate = await this.first.invoke(input, config);
        yield* this.second.stream(intermediate, config);
    }
}
/** Applies a transform function to the output */
class TransformRunnable extends Runnable {
    source;
    fn;
    name;
    constructor(source, fn) {
        super();
        this.source = source;
        this.fn = fn;
        this.name = `${source.name}_transform`;
    }
    async invoke(input, config) {
        const result = await this.source.invoke(input, config);
        return this.fn(result, config);
    }
}
/** Adds retry logic to a runnable */
class RetryRunnable extends Runnable {
    source;
    maxRetries;
    retryDelay;
    name;
    constructor(source, maxRetries, retryDelay) {
        super();
        this.source = source;
        this.maxRetries = maxRetries;
        this.retryDelay = retryDelay;
        this.name = `${source.name}_retry`;
    }
    async invoke(input, config) {
        const effectiveMaxRetries = config?.maxRetries ?? this.maxRetries;
        const effectiveDelay = config?.retryDelay ?? this.retryDelay;
        let lastError;
        for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
            try {
                return await this.source.invoke(input, config);
            }
            catch (err) {
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
class FallbackRunnable extends Runnable {
    primary;
    fallbacks;
    name;
    constructor(primary, fallbacks) {
        super();
        this.primary = primary;
        this.fallbacks = fallbacks;
        this.name = `${primary.name}_fallback`;
    }
    async invoke(input, config) {
        const runnables = [this.primary, ...this.fallbacks];
        let lastError;
        for (const runnable of runnables) {
            try {
                return await runnable.invoke(input, config);
            }
            catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
            }
        }
        throw lastError;
    }
}
/** Binds default config to a runnable */
class ConfigRunnable extends Runnable {
    source;
    defaultConfig;
    name;
    constructor(source, defaultConfig) {
        super();
        this.source = source;
        this.defaultConfig = defaultConfig;
        this.name = source.name;
    }
    async invoke(input, config) {
        const merged = { ...this.defaultConfig, ...config };
        return this.source.invoke(input, merged);
    }
}
/** Creates a Runnable from a plain function */
export function runnable(fn, name) {
    return new LambdaRunnable(fn, name);
}
/** Sequence: runs runnables in order, passing output as input to next */
export function sequence(...runnables) {
    if (runnables.length === 0)
        throw new Error('Sequence requires at least one runnable');
    return runnables.reduce((a, b) => a.pipe(b));
}
/** Parallel: runs all runnables with the same input, returns array of results */
export function parallel(...runnables) {
    return new LambdaRunnable(async (input, config) => {
        return Promise.all(runnables.map((r) => r.invoke(input, config)));
    }, 'parallel');
}
//# sourceMappingURL=runnable.js.map