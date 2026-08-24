// Declarative, self-healing hooks (pattern: openclaude hook-chains +
// claude-code hooks + grok-build hook events). Rules live in
// `.ghita/hooks.json` (project) or `~/.ghita/hooks.json` (global); every tool
// boundary in the agent runtime dispatches events through a HookDispatcher.

/** Lifecycle events a hook rule can subscribe to. */
export type HookEventName =
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Stop'
  | 'PreCompact';

export const HOOK_EVENT_NAMES: readonly HookEventName[] = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'PreCompact',
] as const;

/** Input payload handed to matching rules when an event fires. */
export interface HookDispatchContext {
  event: HookEventName;
  /** Tool name for tool-scoped events; agent name otherwise. */
  tool?: string;
  input?: Record<string, unknown>;
  /** Observation/result for PostToolUse. */
  output?: string;
  /** Error message for PostToolUseFailure. */
  error?: string;
  sessionId?: string;
  agentId?: string;
  /** Working directory shell actions run in (defaults to process cwd). */
  cwd?: string;
}

/** What a hook action decided about the boundary it guards. */
export type HookActionDecision = 'allow' | 'block' | 'ask';

/** Run a shell command; exit code 2 or stdout JSON `{"decision":"block"}` blocks. */
export interface HookShellAction {
  type: 'shell';
  command: string;
  timeoutMs?: number;
}

/** POST the event payload; response JSON `{"decision":"block","reason":"…"}` blocks. */
export interface HookHttpAction {
  type: 'http';
  url: string;
  method?: 'POST' | 'GET';
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** Unconditionally block (used for hard policy rules, no external process). */
export interface HookBlockAction {
  type: 'block';
  reason: string;
}

export type HookAction = HookShellAction | HookHttpAction | HookBlockAction;

/** Matcher: omit to match every tool/agent on the subscribed events. */
export interface HookMatch {
  /** Glob-ish tool match — `*` suffix matches prefixes (e.g. `"terminal.*"`). */
  tool?: string;
}

export interface HookRule {
  id: string;
  /** Events this rule subscribes to. */
  events: HookEventName[] | '*';
  match?: HookMatch;
  action: HookAction;
  /** Minimum ms between two firings of this rule (0 = unlimited). */
  cooldownMs?: number;
  /** Suppress duplicate (event, tool, input-hash) firings within this window. */
  dedupWindowMs?: number;
  /** Fail-open when the action errors (default true — never wedge the agent). */
  failOpen?: boolean;
}

/** Result of executing one rule's action. */
export interface HookActionOutcome {
  ruleId: string;
  ok: boolean;
  decision: HookActionDecision;
  reason?: string;
  durationMs: number;
  error?: string;
  /** Rule matched but was suppressed by cooldown/dedup. */
  suppressed?: boolean;
}

/** Aggregated outcome of dispatching one event. */
export interface HookOutcome {
  event: HookEventName;
  decision: HookActionDecision;
  blockedBy?: string;
  reason?: string;
  results: HookActionOutcome[];
}

/**
 * Boundary a runtime calls to fire hooks. Declared locally so the ReAct agent
 * stays decoupled from the concrete manager (same pattern as PolicyGuard).
 */
export type HookDispatcher = (context: HookDispatchContext) => Promise<HookOutcome> | HookOutcome;

/** Parsed shape of `.ghita/hooks.json`. */
export interface HookFile {
  version: 1;
  rules: HookRule[];
}
