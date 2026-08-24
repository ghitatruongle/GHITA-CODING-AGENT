// Priority-ordered, parallel-capable hook execution engine with timeout
// enforcement, error strategies (continue/fail/skip), audit trail, and
// glob-based tool matching.

import type {
  HookConfig,
  HookEvent,
  HookResult,
  HookRunnerConfig,
  HookAuditEntry,
  HookStats,
  CompositeHookResult,
  HookErrorStrategy,
} from './types.js';

// Helpers

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Simple glob matcher supporting '*' and '?' wildcards */
function matchGlob(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  // Convert glob to regex: escape special chars, replace * and ?
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`).test(value);
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_AUDIT = 1_000;

// HookRunner

export class HookRunner {
  private hooks: HookConfig[] = [];
  private enabled: boolean;
  private readonly defaultTimeoutMs: number;
  private readonly defaultErrorStrategy: HookErrorStrategy;
  private readonly parallel: boolean;
  private readonly maxAuditEntries: number;
  private readonly auditEnabled: boolean;

  /** In-memory audit log (bounded by maxAuditEntries) */
  private readonly auditLog: HookAuditEntry[] = [];

  /** Per-hook execution statistics */
  private readonly statsMap = new Map<string, HookStats>();

  constructor(config?: HookRunnerConfig) {
    this.hooks = config?.hooks ?? [];
    this.enabled = config?.enabled ?? true;
    this.defaultTimeoutMs = config?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultErrorStrategy = config?.defaultErrorStrategy ?? 'continue';
    this.parallel = config?.parallel ?? false;
    this.maxAuditEntries = config?.maxAuditEntries ?? DEFAULT_MAX_AUDIT;
    this.auditEnabled = config?.auditEnabled ?? true;
  }

  // Hook management
  
  /** Load hooks from an array (replaces existing) */
  loadHooks(hooks: HookConfig[]): void {
    this.hooks = hooks;
  }

  /** Add a single hook */
  addHook(hook: HookConfig): void {
    this.hooks.push(hook);
  }

  /** Remove a hook by ID */
  removeHook(id: string): boolean {
    const idx = this.hooks.findIndex((h) => h.id === id);
    if (idx === -1) return false;
    this.hooks.splice(idx, 1);
    return true;
  }

  /** Get a hook by ID */
  getHook(id: string): HookConfig | undefined {
    return this.hooks.find((h) => h.id === id);
  }

  /** Enable/disable the entire hook system */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Check whether the hook system is active */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Return a copy of all registered hooks */
  getHooks(): HookConfig[] {
    return [...this.hooks];
  }

  /** Return hooks filtered by event */
  getHooksByEvent(event: HookEvent): HookConfig[] {
    return this.hooks.filter((h) => h.enabled && h.event === event);
  }

  // Matching
  
  /** Check whether a hook's matcher matches the given tool name */
  matches(hook: HookConfig, toolName: string): boolean {
    const { matcher } = hook;

    // Deny-list has highest priority
    if (matcher.excludeTools?.includes(toolName)) return false;

    // Allow-list: if present, tool must be in it
    if (matcher.toolNames && matcher.toolNames.length > 0) {
      return matcher.toolNames.some((t) => matchGlob(t, toolName));
    }

    // Exact match (with wildcard support)
    if (matcher.tool) {
      if (matcher.tool === '*') return true;
      return matchGlob(matcher.tool, toolName);
    }

    // Glob pattern
    if (matcher.glob) {
      return matchGlob(matcher.glob, toolName);
    }

    // No matcher constraints → matches everything
    return true;
  }

  // Execution
  
  /**
   * Run all hooks matching the given event + tool.
   * Returns a composite result with individual hook results and blocking status.
   */
  async runHooks(
    event: HookEvent,
    toolName: string,
    toolArgs?: Record<string, unknown>,
    toolResult?: string,
  ): Promise<CompositeHookResult> {
    if (!this.enabled) {
      return {
        results: [],
        allPassed: true,
        blocked: false,
        totalDurationMs: 0,
      };
    }

    const matching = this.hooks
      .filter((h) => h.enabled && h.event === event && this.matches(h, toolName))
      .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

    if (matching.length === 0) {
      return {
        results: [],
        allPassed: true,
        blocked: false,
        totalDurationMs: 0,
      };
    }

    const startAll = Date.now();
    let results: HookResult[];

    if (this.parallel) {
      results = await Promise.all(
        matching.map((h) => this.executeHook(h, toolName, toolArgs, toolResult)),
      );
    } else {
      results = await this.executeSequential(matching, toolName, toolArgs, toolResult);
    }

    const totalDurationMs = Date.now() - startAll;
    const anyBlocked = results.some((r) => r.blocked);
    const anyFailed = results.some((r) => !r.success);
    const blockReason = results.find((r) => r.blocked)?.blockReason;

    // Record audit entry
    const auditId = this.recordAudit(event, toolName, matching, results, totalDurationMs);

    return {
      results,
      allPassed: !anyFailed,
      blocked: anyBlocked,
      blockReason,
      totalDurationMs,
      auditId,
    };
  }

  /**
   * Convenience method for pre_tool hooks — returns the legacy HookResult[].
   * New code should prefer runHooks() which returns CompositeHookResult.
   */
  async runPreTool(toolName: string, toolArgs?: Record<string, unknown>): Promise<HookResult[]> {
    const composite = await this.runHooks('pre_tool', toolName, toolArgs);
    return composite.results;
  }

  /**
   * Convenience method for post_tool hooks.
   */
  async runPostTool(
    toolName: string,
    toolArgs?: Record<string, unknown>,
    toolResult?: string,
  ): Promise<HookResult[]> {
    const composite = await this.runHooks('post_tool', toolName, toolArgs, toolResult);
    return composite.results;
  }

  // Sequential execution with error strategy
  
  private async executeSequential(
    hooks: HookConfig[],
    toolName: string,
    toolArgs?: Record<string, unknown>,
    toolResult?: string,
  ): Promise<HookResult[]> {
    const results: HookResult[] = [];

    for (const hook of hooks) {
      const result = await this.executeHook(hook, toolName, toolArgs, toolResult);
      results.push(result);

      // Apply error strategy on failure
      if (!result.success) {
        const strategy = hook.errorStrategy ?? this.defaultErrorStrategy;
        if (strategy === 'fail') break;
        if (strategy === 'skip') continue;
        // 'continue' → just keep going
      }

      // Stop early if a pre_tool hook blocks the operation
      if (result.blocked) break;
    }

    return results;
  }

  // Single hook execution with timeout
  
  private async executeHook(
    hook: HookConfig,
    toolName: string,
    toolArgs?: Record<string, unknown>,
    toolResult?: string,
  ): Promise<HookResult> {
    const timeoutMs = hook.timeoutMs ?? this.defaultTimeoutMs;
    const start = Date.now();

    // Ensure stats entry exists
    this.ensureStats(hook.id);

    try {
      const result = await this.withTimeout(
        this.invokeHook(hook, toolName, toolArgs, toolResult),
        timeoutMs,
        hook.id,
      );

      this.updateStats(hook.id, result);
      return result;
    } catch (err) {
      const result: HookResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        hookId: hook.id,
      };
      this.updateStats(hook.id, result);
      return result;
    }
  }

  /** Invoke the hook handler or resolve the command template */
  private async invokeHook(
    hook: HookConfig,
    toolName: string,
    toolArgs?: Record<string, unknown>,
    toolResult?: string,
  ): Promise<HookResult> {
    const start = Date.now();

    try {
      if (hook.handler) {
        const result = await hook.handler(toolName, toolArgs ?? {}, toolResult);
        return { ...result, durationMs: Date.now() - start, hookId: hook.id };
      }

      // Resolve command template
      let command = hook.command;
      command = command.replace(/\$TOOL_NAME/g, toolName);
      command = command.replace(/\$TOOL_ARGS/g, JSON.stringify(toolArgs ?? {}));
      if (toolResult !== undefined) {
        command = command.replace(/\$TOOL_RESULT/g, toolResult);
      }

      return {
        success: true,
        output: `[Hook:${hook.id}] Command resolved: ${command}`,
        durationMs: Date.now() - start,
        hookId: hook.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        hookId: hook.id,
      };
    }
  }

  /** Wrap a promise with a timeout */
  private withTimeout<T>(promise: Promise<T>, ms: number, hookId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Hook '${hookId}' timed out after ${ms}ms`));
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

  // Audit Trail
  
  private recordAudit(
    event: HookEvent,
    toolName: string,
    hooks: HookConfig[],
    results: HookResult[],
    totalDurationMs: number,
  ): string | undefined {
    if (!this.auditEnabled) return undefined;

    const id = generateId('audit');
    const entry: HookAuditEntry = {
      id,
      timestamp: Date.now(),
      event,
      toolName,
      hookIds: hooks.map((h) => h.id),
      results,
      totalDurationMs,
      anyBlocked: results.some((r) => r.blocked),
      anyFailed: results.some((r) => !r.success),
    };

    this.auditLog.push(entry);

    // Bounded retention
    while (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog.shift();
    }

    return id;
  }

  /** Query audit log entries */
  getAuditLog(options?: {
    event?: HookEvent;
    toolName?: string;
    limit?: number;
  }): HookAuditEntry[] {
    let entries = [...this.auditLog];
    if (options?.event) entries = entries.filter((e) => e.event === options.event);
    if (options?.toolName) entries = entries.filter((e) => e.toolName === options.toolName);
    if (options?.limit) entries = entries.slice(-options.limit);
    return entries;
  }

  /** Clear the audit log */
  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  // Statistics
  
  private ensureStats(hookId: string): void {
    if (!this.statsMap.has(hookId)) {
      this.statsMap.set(hookId, {
        hookId,
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        timeoutCount: 0,
        blockCount: 0,
        avgDurationMs: 0,
        lastExecutedAt: 0,
      });
    }
  }

  private updateStats(hookId: string, result: HookResult): void {
    const stats = this.statsMap.get(hookId);
    if (!stats) return;

    const prevTotal = stats.totalCalls;
    stats.totalCalls += 1;
    stats.lastExecutedAt = Date.now();

    if (result.success) {
      stats.successCount += 1;
    } else {
      stats.failureCount += 1;
    }

    if (result.timedOut) stats.timeoutCount += 1;
    if (result.blocked) stats.blockCount += 1;

    // Running average
    stats.avgDurationMs = (stats.avgDurationMs * prevTotal + result.durationMs) / stats.totalCalls;
  }

  /** Get stats for a specific hook */
  getStats(hookId: string): HookStats | undefined {
    return this.statsMap.get(hookId);
  }

  /** Get stats for all hooks */
  getAllStats(): HookStats[] {
    return [...this.statsMap.values()];
  }

  /** Reset all stats */
  resetStats(): void {
    this.statsMap.clear();
  }
}
