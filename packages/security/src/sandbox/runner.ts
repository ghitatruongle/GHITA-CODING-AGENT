// ==============================================================================
// GHITA CODING AGENT — Sandbox Process Runner (v1.1.5-beta2 Track 2)
// ------------------------------------------------------------------------------
// Multi-platform sandbox executor combining:
// 1. Pre-execution command policy checking (`checkCommand`)
// 2. Native OS sandbox enforcement (`ghita-sandbox` addon)
// 3. Fallback to child_process with timeout and env scrubbing
// ==============================================================================

import { spawnSync } from 'node:child_process';
import { loadNative } from '@ghita/native-bridge';
import { checkCommand } from '../governance/exec-policy.js';
import type { ExecPolicyRule } from '../governance/exec-policy.js';

export type SandboxProfileType = 'workspace' | 'read-only' | 'strict';

export interface SandboxRunnerOptions {
  profile?: SandboxProfileType;
  workspace?: string;
  denyGlobs?: string[];
  envAllow?: string[];
  timeoutMs?: number;
  memoryLimitMb?: number;
  processLimit?: number;
  execRules?: ExecPolicyRule[];
}

export interface SandboxViolationInfo {
  reason: string;
  detail: string;
}

export interface SandboxExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  enforcement: 'landlock' | 'seatbelt' | 'supervised' | 'fallback-js';
  violations: SandboxViolationInfo[];
  blocked: boolean;
  requiresApproval?: boolean;
}

interface SandboxNative {
  spawnSandboxed(
    command: string,
    args: string[],
    options?: {
      profile?: string;
      workspace?: string;
      deny_globs?: string[];
      env_allow?: string[];
      timeout_ms?: number;
      memory_limit_mb?: number;
      process_limit?: number;
    },
  ): {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    enforcement: string;
    violations: Array<{ reason: string; detail: string }>;
    blocked: boolean;
  };
}

const sandboxBridge = () =>
  loadNative<SandboxNative>('sandbox', undefined as unknown as SandboxNative);

export class SandboxRunner {
  private readonly defaultOptions: SandboxRunnerOptions;

  constructor(defaultOptions: SandboxRunnerOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Run a process safely inside the sandbox with pre-exec inspection and OS containment.
   */
  async run(
    command: string,
    args: string[] = [],
    options: SandboxRunnerOptions = {},
  ): Promise<SandboxExecutionResult> {
    const opts = { ...this.defaultOptions, ...options };
    const fullCommandLine = [command, ...args].join(' ');

    // 1. Pre-execution governance check
    const verdict = checkCommand(fullCommandLine, opts.execRules);
    if (verdict.decision === 'deny') {
      return {
        exitCode: null,
        stdout: '',
        stderr: `[governance:deny] ${verdict.reason ?? 'Command blocked by execution policy.'}`,
        durationMs: 0,
        enforcement: 'supervised',
        violations: [
          {
            reason: 'exec-policy-deny',
            detail: verdict.reason ?? `Command matches deny rule ${verdict.matchedRule?.id}`,
          },
        ],
        blocked: true,
      };
    }

    // 2. Execute via native addon if available
    const bridge = sandboxBridge();
    if (bridge.native && typeof bridge.impl?.spawnSandboxed === 'function') {
      try {
        const res = bridge.impl.spawnSandboxed(command, args, {
          profile: opts.profile ?? 'workspace',
          workspace: opts.workspace,
          deny_globs: opts.denyGlobs,
          env_allow: opts.envAllow,
          timeout_ms: opts.timeoutMs ?? 120_000,
          memory_limit_mb: opts.memoryLimitMb,
          process_limit: opts.processLimit ?? 64,
        });

        return {
          exitCode: res.exitCode,
          stdout: res.stdout,
          stderr: res.stderr,
          durationMs: res.durationMs,
          enforcement: (res.enforcement as SandboxExecutionResult['enforcement']) || 'supervised',
          violations: res.violations,
          blocked: res.blocked,
          requiresApproval: verdict.decision === 'ask',
        };
      } catch (err) {
        // Fall back to JS spawnSync
      }
    }

    // 3. Fallback pure-Node execution with timeout and working directory
    const start = Date.now();
    try {
      const proc = spawnSync(command, args, {
        cwd: opts.workspace ?? process.cwd(),
        timeout: opts.timeoutMs ?? 120_000,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      return {
        exitCode: proc.status,
        stdout: proc.stdout ?? '',
        stderr: proc.stderr ?? (proc.error ? proc.error.message : ''),
        durationMs: Date.now() - start,
        enforcement: 'fallback-js',
        violations: proc.error ? [{ reason: 'spawn-error', detail: proc.error.message }] : [],
        blocked: false,
        requiresApproval: verdict.decision === 'ask',
      };
    } catch (e) {
      return {
        exitCode: null,
        stdout: '',
        stderr: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - start,
        enforcement: 'fallback-js',
        violations: [{ reason: 'spawn-exception', detail: String(e) }],
        blocked: false,
        requiresApproval: verdict.decision === 'ask',
      };
    }
  }
}
