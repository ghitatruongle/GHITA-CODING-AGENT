// ==============================================================================
// GHITA CODING AGENT - Hooks Types (Phase 12 Enhanced)
// ==============================================================================
// Comprehensive type system for the hook runner, security checkers, and
// audit trail. Supports priority ordering, timeout policies, error strategies,
// parallel execution, and glob-based tool matching.
// ==============================================================================

/** Event that triggers a hook */
export type HookEvent = 'pre_tool' | 'post_tool' | 'pre_response' | 'on_error' | 'on_complete';

/** How the runner reacts when a hook fails */
export type HookErrorStrategy = 'continue' | 'fail' | 'skip';

/** Security risk classification */
export type SecurityRiskLevel = 'safe' | 'low' | 'warning' | 'high' | 'critical';

/** Matcher to determine which tools a hook applies to */
export interface HookMatcher {
  /** Exact tool name (supports '*' wildcard for all tools) */
  tool?: string;
  /** Glob pattern for tool names (e.g. 'file.*', 'terminal.*') */
  glob?: string;
  /** Explicit allow-list of tool names */
  toolNames?: string[];
  /** Explicit deny-list of tool names */
  excludeTools?: string[];
}

/** Configuration for a single hook */
export interface HookConfig {
  /** Unique identifier for this hook */
  id: string;
  /** Human-readable name */
  name: string;
  /** Event that triggers this hook */
  event: HookEvent;
  /** Tool matching criteria */
  matcher: HookMatcher;
  /** Shell command template (supports $TOOL_NAME, $TOOL_ARGS, $TOOL_RESULT) */
  command: string;
  /** Timeout in milliseconds (default: 10_000) */
  timeoutMs?: number;
  /** Whether this hook is active */
  enabled: boolean;
  /** Execution priority (lower = runs first, default: 50) */
  priority?: number;
  /** Error strategy when this hook fails (default: 'continue') */
  errorStrategy?: HookErrorStrategy;
  /** Custom handler function (takes precedence over command) */
  handler?: HookHandler;
  /** Arbitrary metadata tags */
  tags?: string[];
}

/** Handler function signature */
export type HookHandler = (
  toolName: string,
  args: Record<string, unknown>,
  toolResult?: string,
) => Promise<HookResult>;

/** Result of executing a single hook */
export interface HookResult {
  /** Whether the hook executed successfully */
  success: boolean;
  /** Output from the hook */
  output?: string;
  /** Error message if the hook failed */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether the hook timed out */
  timedOut?: boolean;
  /** Hook ID that produced this result */
  hookId?: string;
  /** Whether to block the tool call (pre_tool hooks only) */
  blocked?: boolean;
  /** Reason for blocking */
  blockReason?: string;
}

/** Configuration for the HookRunner */
export interface HookRunnerConfig {
  /** Registered hooks */
  hooks?: HookConfig[];
  /** Master enable/disable switch */
  enabled?: boolean;
  /** Default timeout for hooks without explicit timeoutMs (default: 10_000) */
  defaultTimeoutMs?: number;
  /** Default error strategy (default: 'continue') */
  defaultErrorStrategy?: HookErrorStrategy;
  /** Whether to run hooks of the same event in parallel (default: false) */
  parallel?: boolean;
  /** Maximum number of audit log entries to retain (default: 1000) */
  maxAuditEntries?: number;
  /** Whether to record audit trail (default: true) */
  auditEnabled?: boolean;
}

/** Audit trail entry */
export interface HookAuditEntry {
  /** Unique audit entry ID */
  id: string;
  /** Timestamp of execution */
  timestamp: number;
  /** Hook event that was triggered */
  event: HookEvent;
  /** Tool that triggered the hook */
  toolName: string;
  /** IDs of hooks that were executed */
  hookIds: string[];
  /** Results from each hook */
  results: HookResult[];
  /** Total execution duration */
  totalDurationMs: number;
  /** Whether any hook blocked the operation */
  anyBlocked: boolean;
  /** Whether any hook failed */
  anyFailed: boolean;
}

/** Per-hook execution statistics */
export interface HookStats {
  /** Hook ID */
  hookId: string;
  /** Total number of invocations */
  totalCalls: number;
  /** Number of successful executions */
  successCount: number;
  /** Number of failed executions */
  failureCount: number;
  /** Number of timeouts */
  timeoutCount: number;
  /** Number of times this hook blocked a tool call */
  blockCount: number;
  /** Average execution duration in ms */
  avgDurationMs: number;
  /** Last execution timestamp */
  lastExecutedAt: number;
}

/** Security analysis result */
export interface SecurityAnalysis {
  /** Risk level classification */
  riskLevel: SecurityRiskLevel;
  /** Human-readable explanation */
  explanation: string;
  /** Whether the operation should be blocked */
  blocked: boolean;
  /** Specific rule/pattern that matched */
  matchedRule?: string;
  /** Suggested remediation */
  suggestion?: string;
}

/** Security profile for a specific tool */
export interface SecurityProfile {
  /** Tool name pattern */
  toolPattern: string;
  /** Maximum allowed risk level before blocking */
  maxAllowedRisk: SecurityRiskLevel;
  /** Custom allowed commands/patterns for this tool */
  allowList?: string[];
  /** Custom denied commands/patterns for this tool */
  denyList?: string[];
  /** Whether to require explicit user approval for this tool */
  requireApproval?: boolean;
}

/** Composite hook execution result (multiple hooks) */
export interface CompositeHookResult {
  /** Individual hook results */
  results: HookResult[];
  /** Whether all hooks succeeded */
  allPassed: boolean;
  /** Whether any hook blocked the operation */
  blocked: boolean;
  /** The first block reason (if any) */
  blockReason?: string;
  /** Total execution duration */
  totalDurationMs: number;
  /** Audit entry ID for this execution */
  auditId?: string;
}
