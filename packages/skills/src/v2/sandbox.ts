// ==============================================================================
// GHITA CODING AGENT - Skills v1.1.0 Track 2: skill sandbox runner (P28/P29)
// ==============================================================================
// Runs skill scripts inside a Docker container with GHITA sandbox labels and
// resource limits. Docker presence is probed; when unavailable or disabled the
// runner refuses (deny-default) instead of falling back to the host.
// ==============================================================================

import { spawnSync } from 'node:child_process';

export interface SandboxConfig {
  /** Master switch — sandboxing is OFF by default (P29). */
  enabled: boolean;
  /** Base image for skill scripts. */
  defaultImage: string;
  /** Memory limit passed to docker run (e.g. "512m"). */
  memory?: string;
  /** CPU limit (e.g. "1.0"). */
  cpus?: string;
  /** Disable network in the sandbox (default true). */
  networkDisabled?: boolean;
}

export interface SandboxRunOptions {
  image?: string;
  /** Host directory mounted at /workspace (read-write). */
  workspace?: string;
  /** Extra docker args (allowlist safe: env only). */
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface SandboxRunResult {
  ok: boolean;
  exitCode?: number;
  stdout: string;
  stderr: string;
  reason?: string;
}

export interface SandboxExecutor {
  (args: string[]): { status: number | null; stdout: Buffer; stderr: Buffer };
}

/** Default executor wrapping spawnSync('docker', args). */
export const defaultExecutor: SandboxExecutor = (args) => {
  const res = spawnSync('docker', args, { encoding: 'buffer' });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
};

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: false,
  defaultImage: 'ghita-skill-runtime:latest',
  memory: '512m',
  cpus: '1.0',
  networkDisabled: true,
};

/** Probe docker availability (spawns `docker version` once). */
export function dockerAvailable(executor: SandboxExecutor = defaultExecutor): boolean {
  const res = executor(['version', '--format', '{{.Server.Version}}']);
  return res.status === 0;
}

export class SkillSandboxRunner {
  constructor(
    private readonly config: SandboxConfig = DEFAULT_CONFIG,
    private readonly executor: SandboxExecutor = defaultExecutor,
  ) {}

  /** Docker availability check. */
  isAvailable(): boolean {
    return dockerAvailable(this.executor);
  }

  /**
   * Run a command inside the sandbox. Denies when sandboxing is disabled or
   * docker is unavailable (no silent host fallback).
   */
  run(command: string[], options: SandboxRunOptions = {}): SandboxRunResult {
    if (!this.config.enabled) {
      return {
        ok: false,
        reason: 'skill sandbox is disabled (config.enabled=false)',
        stdout: '',
        stderr: '',
      };
    }
    if (!this.isAvailable()) {
      return { ok: false, reason: 'docker not available on this host', stdout: '', stderr: '' };
    }
    if (command.length === 0) {
      return { ok: false, reason: 'empty command', stdout: '', stderr: '' };
    }

    const args = ['run', '--rm'];
    args.push('--label', 'ghita-sandbox-id=skill');
    if (this.config.memory) args.push('--memory', this.config.memory);
    if (this.config.cpus) args.push('--cpus', this.config.cpus);
    if (this.config.networkDisabled) args.push('--network', 'none');
    if (options.workspace) args.push('-v', `${options.workspace}:/workspace`, '-w', '/workspace');
    for (const [k, v] of Object.entries(options.env ?? {})) {
      args.push('-e', `${k}=${v}`);
    }
    args.push(options.image ?? this.config.defaultImage);
    args.push(...command);

    const res = this.executor(args);
    const stdout = res.stdout?.toString() ?? '';
    const stderr = res.stderr?.toString() ?? '';
    return {
      ok: res.status === 0,
      exitCode: res.status ?? undefined,
      stdout,
      stderr,
    };
  }
}
