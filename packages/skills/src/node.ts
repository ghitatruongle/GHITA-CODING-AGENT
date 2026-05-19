// ==============================================================================
// GHITA CODING AGENT - Node Runtime Adapters for Skills
// ==============================================================================

import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { platform } from 'node:process';
import { createDefaultSkillRegistry, type SkillRuntimeAdapters } from './index.js';

export interface NodeSkillAdapterOptions {
  defaultCwd?: string;
  maxOutputBytes?: number;
}

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

function trimOutput(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  return `${value.slice(0, maxBytes)}\n[output truncated at ${maxBytes} bytes]`;
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

  return new Promise((resolveProcess) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      resolveProcess({
        exitCode,
        stdout: trimOutput(stdout, options.maxOutputBytes),
        stderr: trimOutput(stderr, options.maxOutputBytes),
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
      stdout += chunk.toString('utf8');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
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
  });
}

function windowlessSetTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
  return setTimeout(callback, ms);
}

export function createNodeSkillAdapters(options: NodeSkillAdapterOptions = {}): SkillRuntimeAdapters {
  const defaultCwd = options.defaultCwd ? resolve(options.defaultCwd) : process.cwd();
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return {
    file: {
      readFile: async (path) => readFile(resolve(defaultCwd, path), 'utf8'),
      writeFile: async (path, content) => {
        const target = resolve(defaultCwd, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, 'utf8');
      },
      listDirectory: async (path) => {
        const directory = resolve(defaultCwd, path);
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
          cwd: commandOptions?.cwd ? resolve(defaultCwd, commandOptions.cwd) : defaultCwd,
          timeoutMs: commandOptions?.timeoutMs,
          signal: commandOptions?.signal,
          maxOutputBytes,
        }),
    },
    app: {
      openApp: async (target, args = []) => {
        const command = platform === 'win32' ? `start "" "${target}" ${args.join(' ')}` : `"${target}" ${args.join(' ')}`;
        await runProcess(command, { cwd: defaultCwd, timeoutMs: 5000, maxOutputBytes });
      },
      closeApp: async (target) => {
        const command = platform === 'win32' ? `taskkill /IM "${target}" /T` : `pkill -f "${target}"`;
        await runProcess(command, { cwd: defaultCwd, timeoutMs: 5000, maxOutputBytes });
      },
    },
  };
}

export function createNodeSkillRegistry(options: NodeSkillAdapterOptions = {}) {
  return createDefaultSkillRegistry(createNodeSkillAdapters(options));
}
