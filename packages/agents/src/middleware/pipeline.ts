/* eslint-disable @typescript-eslint/no-non-null-assertion */
// ==============================================================================
// GHITA CODING AGENT - Agent Middleware Pipeline (Phase 12 Enhanced)
// ==============================================================================
// Priority-ordered middleware execution with:
// - Per-middleware timeout enforcement
// - Error boundary mode (stop pipeline on error)
// - Dry-run mode (execute but don't apply mutations)
// - Execution metrics tracking (per-call & aggregate stats)
// ==============================================================================

import type {
  AgentMiddleware,
  MiddlewareContext,
  AgentStepResult,
  MiddlewarePipelineConfig,
  MiddlewareMetric,
  MiddlewareStats,
  PreModelResult,
  PostModelResult,
} from './types.js';
import type { BaseMessage } from '../messages/message.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_METRICS = 500;

type MetricPhase = MiddlewareMetric['phase'];

export class MiddlewarePipeline {
  private readonly middlewares: AgentMiddleware[] = [];

  /** Pipeline configuration */
  private readonly config: Required<MiddlewarePipelineConfig>;

  /** Metrics log (bounded ring buffer) */
  private readonly metrics: MiddlewareMetric[] = [];

  /** Per-middleware aggregate statistics */
  private readonly statsMap = new Map<string, MiddlewareStats>();

  constructor(config?: MiddlewarePipelineConfig) {
    this.config = {
      middlewareTimeoutMs: config?.middlewareTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      errorBoundary: config?.errorBoundary ?? false,
      dryRun: config?.dryRun ?? false,
      maxMetricsEntries: config?.maxMetricsEntries ?? DEFAULT_MAX_METRICS,
      metricsEnabled: config?.metricsEnabled ?? true,
    };
  }

  // -----------------------------------------------------------------------
  // Middleware management
  // -----------------------------------------------------------------------

  /** Register a middleware */
  use(middleware: AgentMiddleware): void {
    this.middlewares.push(middleware);
    this.middlewares.sort((a, b) => a.priority - b.priority);
  }

  /** Remove a middleware by name */
  remove(name: string): boolean {
    const idx = this.middlewares.findIndex((m) => m.name === name);
    if (idx === -1) return false;
    this.middlewares.splice(idx, 1);
    return true;
  }

  /** List registered middleware names (in priority order) */
  list(): string[] {
    return this.middlewares.map((m) => m.name);
  }

  /** Get a middleware by name */
  get(name: string): AgentMiddleware | undefined {
    return this.middlewares.find((m) => m.name === name);
  }

  /** Update pipeline config at runtime */
  updateConfig(patch: Partial<MiddlewarePipelineConfig>): void {
    Object.assign(this.config, patch);
  }

  /** Check if dry-run mode is active */
  isDryRun(): boolean {
    return this.config.dryRun;
  }

  // -----------------------------------------------------------------------
  // Pre-model hooks
  // -----------------------------------------------------------------------

  /** Run all preModel hooks, applying modifications in priority order */
  async runPreModel(context: MiddlewareContext): Promise<{
    context: MiddlewareContext;
    shortCircuit?: BaseMessage;
  }> {
    let currentContext = { ...context };

    for (const mw of this.middlewares) {
      if (!mw.preModel) continue;

      const result = await this.safeInvoke(mw, 'preModel', () => mw.preModel!(currentContext));

      if (result === undefined || result === null) continue;

      // In dry-run mode, log but don't apply
      if (this.config.dryRun) continue;

      const typed = result as PreModelResult;

      if (typed.shortCircuit) {
        return { context: currentContext, shortCircuit: typed.shortCircuit };
      }

      currentContext = {
        ...currentContext,
        messages: typed.messages ?? currentContext.messages,
        model: typed.model ?? currentContext.model,
        provider: typed.provider ?? currentContext.provider,
        metadata: { ...currentContext.metadata, ...typed.metadata },
      };
    }

    return { context: currentContext };
  }

  // -----------------------------------------------------------------------
  // Post-model hooks
  // -----------------------------------------------------------------------

  /** Run all postModel hooks */
  async runPostModel(
    context: MiddlewareContext,
    stepResult: AgentStepResult,
  ): Promise<{ result: AgentStepResult; retry: boolean; retryReason?: string }> {
    const currentResult = { ...stepResult };
    let retry = false;
    let retryReason: string | undefined;

    for (const mw of this.middlewares) {
      if (!mw.postModel) continue;

      const result = await this.safeInvoke(mw, 'postModel', () =>
        mw.postModel!(context, currentResult),
      );

      if (result === undefined || result === null) continue;
      if (this.config.dryRun) continue;

      const typed = result as PostModelResult;

      if (typed.response) currentResult.response = typed.response;
      if (typed.retry) {
        retry = true;
        retryReason = typed.retryReason;
      }
      if (typed.metadata) {
        context = { ...context, metadata: { ...context.metadata, ...typed.metadata } };
      }
    }

    return { result: currentResult, retry, retryReason };
  }

  // -----------------------------------------------------------------------
  // Pre-tool hooks
  // -----------------------------------------------------------------------

  /** Run all preTool hooks */
  async runPreTool(
    toolName: string,
    args: Record<string, unknown>,
    context: MiddlewareContext,
  ): Promise<{ proceed: boolean; args: Record<string, unknown>; reason?: string }> {
    let currentArgs = { ...args };

    for (const mw of this.middlewares) {
      if (!mw.preTool) continue;

      const result = await this.safeInvoke(mw, 'preTool', () =>
        mw.preTool!(toolName, currentArgs, context),
      );

      if (result === undefined || result === null) continue;
      if (this.config.dryRun) continue;

      const typed = result as {
        proceed: boolean;
        modifiedArgs?: Record<string, unknown>;
        reason?: string;
      };
      if (!typed.proceed) {
        return { proceed: false, args: currentArgs, reason: typed.reason };
      }
      if (typed.modifiedArgs) {
        currentArgs = { ...currentArgs, ...typed.modifiedArgs };
      }
    }

    return { proceed: true, args: currentArgs };
  }

  // -----------------------------------------------------------------------
  // Post-tool hooks
  // -----------------------------------------------------------------------

  /** Run all postTool hooks */
  async runPostTool(toolName: string, result: string, context: MiddlewareContext): Promise<string> {
    let currentResult = result;

    for (const mw of this.middlewares) {
      if (!mw.postTool) continue;

      const r = await this.safeInvoke(mw, 'postTool', () =>
        mw.postTool!(toolName, currentResult, context),
      );

      if (r === undefined || r === null) continue;
      if (this.config.dryRun) continue;

      const typed = r as { modifiedResult?: string };
      if (typed.modifiedResult !== undefined) {
        currentResult = typed.modifiedResult;
      }
    }

    return currentResult;
  }

  // -----------------------------------------------------------------------
  // Error hooks
  // -----------------------------------------------------------------------

  /** Run all onError hooks */
  async runOnError(error: Error, context: MiddlewareContext): Promise<{ retry: boolean }> {
    let shouldRetry = false;

    for (const mw of this.middlewares) {
      if (!mw.onError) continue;

      const result = await this.safeInvoke(mw, 'onError', () => mw.onError!(error, context));

      if (result === undefined || result === null) continue;
      if (this.config.dryRun) continue;

      const typed = result as { retry?: boolean };
      if (typed.retry) shouldRetry = true;
    }

    return { retry: shouldRetry };
  }

  // -----------------------------------------------------------------------
  // Complete hooks
  // -----------------------------------------------------------------------

  /** Run all onComplete hooks */
  async runOnComplete(context: MiddlewareContext, finalResponse: BaseMessage): Promise<void> {
    for (const mw of this.middlewares) {
      if (!mw.onComplete) continue;

      await this.safeInvoke(mw, 'onComplete', () => mw.onComplete!(context, finalResponse));
    }
  }

  // -----------------------------------------------------------------------
  // Safe invocation with timeout & error boundary
  // -----------------------------------------------------------------------

  /** Execute a middleware hook with timeout enforcement and error handling */
  private async safeInvoke<T>(
    mw: AgentMiddleware,
    phase: MetricPhase,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    const start = Date.now();

    try {
      const result = await this.withTimeout(fn(), this.config.middlewareTimeoutMs, mw.name, phase);
      this.recordMetric(mw.name, phase, Date.now() - start, true);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.recordMetric(mw.name, phase, Date.now() - start, false, errorMsg);

      // In error boundary mode, re-throw to halt the pipeline
      if (this.config.errorBoundary) {
        throw new Error(
          `[Pipeline Error Boundary] Middleware '${mw.name}' failed during '${phase}': ${errorMsg}`,
        );
      }

      // Otherwise, swallow and continue
      return undefined;
    }
  }

  /** Wrap a promise with a timeout */
  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    mwName: string,
    phase: MetricPhase,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Middleware '${mwName}' timed out after ${ms}ms during '${phase}'`));
      }, ms);

      promise
        .then((val) => {
          clearTimeout(timer);
          resolve(val);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  // -----------------------------------------------------------------------
  // Metrics
  // -----------------------------------------------------------------------

  private recordMetric(
    name: string,
    phase: MetricPhase,
    durationMs: number,
    success: boolean,
    error?: string,
  ): void {
    if (!this.config.metricsEnabled) return;

    const metric: MiddlewareMetric = {
      middlewareName: name,
      phase,
      durationMs,
      success,
      error,
      timestamp: Date.now(),
    };

    this.metrics.push(metric);
    while (this.metrics.length > this.config.maxMetricsEntries) {
      this.metrics.shift();
    }

    // Update aggregate stats
    this.updateStats(name, durationMs, success);
  }

  private updateStats(name: string, durationMs: number, success: boolean): void {
    let stats = this.statsMap.get(name);
    if (!stats) {
      stats = {
        name,
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        avgDurationMs: 0,
        lastExecutedAt: 0,
      };
      this.statsMap.set(name, stats);
    }

    const prev = stats.totalCalls;
    stats.totalCalls += 1;
    stats.lastExecutedAt = Date.now();

    if (success) stats.successCount += 1;
    else stats.failureCount += 1;

    stats.avgDurationMs = (stats.avgDurationMs * prev + durationMs) / stats.totalCalls;
  }

  /** Query recorded metrics */
  getMetrics(options?: {
    middlewareName?: string;
    phase?: MetricPhase;
    limit?: number;
  }): MiddlewareMetric[] {
    let entries = [...this.metrics];
    if (options?.middlewareName)
      entries = entries.filter((m) => m.middlewareName === options.middlewareName);
    if (options?.phase) entries = entries.filter((m) => m.phase === options.phase);
    if (options?.limit) entries = entries.slice(-options.limit);
    return entries;
  }

  /** Get aggregate stats for a middleware */
  getStats(name: string): MiddlewareStats | undefined {
    return this.statsMap.get(name);
  }

  /** Get aggregate stats for all middlewares */
  getAllStats(): MiddlewareStats[] {
    return [...this.statsMap.values()];
  }

  /** Clear all metrics and stats */
  clearMetrics(): void {
    this.metrics.length = 0;
    this.statsMap.clear();
  }
}
