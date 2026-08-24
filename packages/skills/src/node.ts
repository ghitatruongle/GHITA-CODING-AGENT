import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { platform } from 'node:process';
import { createDefaultSkillRegistry, type SkillRuntimeAdapters } from './index.js';
import { PolicyEnforcer } from './governance/policy-enforcer.js';

export interface NodeSkillAdapterOptions {
  defaultCwd?: string;
  maxOutputBytes?: number;
}

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

function resolveWorkspacePath(defaultCwd: string, requestedPath: string): string {
  const target = resolve(defaultCwd, requestedPath);
  const rel = relative(defaultCwd, target);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return target;
  }

  throw new Error(`Path is outside the workspace: ${requestedPath}`);
}

function runProcess(
  command: string,
  options: {
    cwd?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    maxOutputBytes: number;
  },
): Promise<{ exitCode: number; stdout: string; stderr: string; duration: number }> {
  const startedAt = Date.now();
  const policy = PolicyEnforcer.evaluateCommand(command);

  if (!policy.allowed) {
    return Promise.resolve({
      exitCode: 126,
      stdout: '',
      stderr: `Command blocked by security policy: ${policy.reason ?? 'unsafe command'}`,
      duration: Date.now() - startedAt,
    });
  }

  return new Promise((resolveProcess) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    monitorChildProcess(child, options, startedAt, resolveProcess);
  });
}

interface RunProcessOptions {
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxOutputBytes: number;
}

type ProcessResult = { exitCode: number; stdout: string; stderr: string; duration: number };

/// Spawn WITHOUT a shell — argv elements reach the OS verbatim, so shell
/// metacharacters in arguments ($(), backticks, &, |) are never interpreted.
function runProcessArgv(
  program: string,
  args: string[],
  options: RunProcessOptions,
): Promise<ProcessResult> {
  const startedAt = Date.now();
  return new Promise((resolveProcess) => {
    const child = spawn(program, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    monitorChildProcess(child, options, startedAt, resolveProcess);
  });
}

function monitorChildProcess(
  child: ReturnType<typeof spawn>,
  options: RunProcessOptions,
  startedAt: number,
  resolveProcess: (result: ProcessResult) => void,
): void {
  let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;

    const appendBounded = (
      current: string,
      chunk: Buffer,
      usedBytes: number,
      truncated: boolean,
    ): { value: string; usedBytes: number; truncated: boolean } => {
      if (truncated) return { value: current, usedBytes, truncated };
      const remaining = options.maxOutputBytes - usedBytes;
      if (remaining <= 0) {
        return {
          value: `${current}\n[output truncated at ${options.maxOutputBytes} bytes]`,
          usedBytes,
          truncated: true,
        };
      }

      const bytes = chunk.subarray(0, remaining);
      const next = current + bytes.toString('utf8');
      const nextUsedBytes = usedBytes + bytes.byteLength;
      if (chunk.byteLength > remaining) {
        return {
          value: `${next}\n[output truncated at ${options.maxOutputBytes} bytes]`,
          usedBytes: nextUsedBytes,
          truncated: true,
        };
      }
      return { value: next, usedBytes: nextUsedBytes, truncated: false };
    };

    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      resolveProcess({
        exitCode,
        stdout,
        stderr,
        duration: Date.now() - startedAt,
      });
    };

    const timeout = windowlessSetTimeout(() => {
      child.kill();
      stderr += `\nCommand timed out after ${options.timeoutMs ?? 30000}ms.`;
      finish(124);
    }, options.timeoutMs ?? 30000);

    options.signal?.addEventListener(
      'abort',
      () => {
        child.kill();
        stderr += '\nCommand aborted.';
        finish(130);
      },
      { once: true },
    );

    child.stdout?.on('data', (chunk: Buffer) => {
      const appended = appendBounded(stdout, chunk, stdoutBytes, stdoutTruncated);
      stdout = appended.value;
      stdoutBytes = appended.usedBytes;
      stdoutTruncated = appended.truncated;
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const appended = appendBounded(stderr, chunk, stderrBytes, stderrTruncated);
      stderr = appended.value;
      stderrBytes = appended.usedBytes;
      stderrTruncated = appended.truncated;
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      stderr += error.message;
      finish(1);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      finish(code ?? 0);
    });
}

function windowlessSetTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
  return setTimeout(callback, ms);
}

export function createNodeSkillAdapters(
  options: NodeSkillAdapterOptions = {},
): SkillRuntimeAdapters {
  const defaultCwd = options.defaultCwd ? resolve(options.defaultCwd) : process.cwd();
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return {
    file: {
      readFile: async (path) => readFile(resolveWorkspacePath(defaultCwd, path), 'utf8'),
      writeFile: async (path, content) => {
        const target = resolveWorkspacePath(defaultCwd, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, 'utf8');
      },
      listDirectory: async (path) => {
        const directory = resolveWorkspacePath(defaultCwd, path);
        const entries = await readdir(directory, { withFileTypes: true });
        return Promise.all(
          entries.map(async (entry) => {
            const fullPath = resolve(directory, entry.name);
            const details = await stat(fullPath);
            return {
              path: fullPath,
              name: entry.name,
              extension: extname(entry.name),
              size: details.size,
              isDirectory: entry.isDirectory(),
              modifiedAt: details.mtimeMs,
            };
          }),
        );
      },
    },
    terminal: {
      runCommand: (command, commandOptions) =>
        runProcess(command, {
          cwd: commandOptions?.cwd
            ? resolveWorkspacePath(defaultCwd, commandOptions.cwd)
            : defaultCwd,
          timeoutMs: commandOptions?.timeoutMs,
          signal: commandOptions?.signal,
          maxOutputBytes,
        }),
    },
    app: {
      openApp: async (target, args = []) => {
        // No shell involved: argv elements are passed directly to the OS so
        // metacharacters ($(), backticks, &, |) can never be re-interpreted.
        // Quotes/percent are rejected outright — they cannot appear safely in
        // a cross-platform argv without shell-level re-parsing.
        const unsafe = [target, ...args].find((a) => /["%`\n]/.test(a));
        if (unsafe !== undefined) {
          throw new Error(`openApp argument contains forbidden characters: ${unsafe}`);
        }
        if (platform === 'win32') {
          await runProcessArgv('cmd.exe', ['/d', '/s', '/c', 'start', '', target, ...args], {
            cwd: defaultCwd,
            timeoutMs: 5000,
            maxOutputBytes,
          });
        } else {
          await runProcessArgv(target, args, { cwd: defaultCwd, timeoutMs: 5000, maxOutputBytes });
        }
      },
      closeApp: async (target) => {
        if (/["%`\n]/.test(target)) {
          throw new Error(`closeApp target contains forbidden characters: ${target}`);
        }
        if (platform === 'win32') {
          await runProcessArgv('taskkill', ['/IM', target, '/T'], {
            cwd: defaultCwd,
            timeoutMs: 5000,
            maxOutputBytes,
          });
        } else {
          await runProcessArgv('pkill', ['-f', target], {
            cwd: defaultCwd,
            timeoutMs: 5000,
            maxOutputBytes,
          });
        }
      },
    },
  };
}

export function createNodeSkillRegistry(options: NodeSkillAdapterOptions = {}) {
  return createDefaultSkillRegistry(createNodeSkillAdapters(options));
}

export { SkillHub } from './registry/hub.js';

export { DocsGriller, createGrillMeCommand } from './engineering/docsGriller.js';
export type {
  DocEntry,
  GrillQuestion,
  GrillSession,
  Contradiction,
  DocsGrillerConfig,
} from './engineering/docsGriller.js';

export { SlashCommandRegistry } from './commands/registry.js';
export type { SlashCommand, SlashCommandFlag, ParsedArgs } from './commands/registry.js';
export { createBuiltinSlashCommands } from './commands/builtins.js';

export { DynamicSkillGenerator, createSkillsSyncCommand } from './registry/dynamicGenerator.js';

export { SkillCatalogClient } from './marketplace/catalog.js';
export { SkillInstaller } from './marketplace/installer.js';
export { SkillRatingsStore } from './marketplace/ratings.js';
export type {
  SkillManifest,
  InstalledSkill,
  SkillCatalog,
  CatalogFilters,
  SkillRating,
} from './marketplace/types.js';
