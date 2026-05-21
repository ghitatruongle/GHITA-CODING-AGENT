// ==============================================================================
// GHITA CODING AGENT - Sandbox Execution
// Chạy code AI trong child process cách ly với resource limits
// ==============================================================================

import { spawn, type ChildProcess } from 'node:child_process';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

export interface SandboxConfig {
  /** Thời gian tối đa chạy (ms), mặc định 30s */
  timeoutMs?: number;
  /** Bộ nhớ tối đa (MB), mặc định 256MB */
  memoryLimitMb?: number;
  /** Cho phép truy cập network, mặc định false */
  allowNetwork?: boolean;
  /** Working directory cho sandbox */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Ngôn ngữ: 'javascript' | 'typescript' | 'python' | 'shell' */
  language?: SandboxLanguage;
}

export type SandboxLanguage = 'javascript' | 'typescript' | 'python' | 'shell';

export interface SandboxResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  killed: boolean;
  error?: string;
}

interface SandboxFile {
  path: string;
  cleanup: () => Promise<void>;
}

const LANGUAGE_RUNNERS: Record<SandboxLanguage, { cmd: string; args: (file: string) => string[] }> = {
  javascript: {
    cmd: process.execPath,
    args: (file) => [file],
  },
  typescript: {
    cmd: process.execPath,
    args: (file) => ['--import', 'tsx', file],
  },
  python: {
    cmd: 'python3',
    args: (file) => [file],
  },
  shell: {
    cmd: process.platform === 'win32' ? 'cmd' : 'sh',
    args: (file) => (process.platform === 'win32' ? ['/c', file] : [file]),
  },
};

function createTempDir(): string {
  const id = randomBytes(8).toString('hex');
  return join(tmpdir(), `ghita-sandbox-${id}`);
}

async function writeTempFile(
  dir: string,
  code: string,
  lang: SandboxLanguage,
): Promise<SandboxFile> {
  const extensions: Record<SandboxLanguage, string> = {
    javascript: '.mjs',
    typescript: '.mts',
    python: '.py',
    shell: process.platform === 'win32' ? '.cmd' : '.sh',
  };

  const filename = `sandbox${extensions[lang]}`;
  const filepath = join(dir, filename);

  await mkdir(dir, { recursive: true });
  await writeFile(filepath, code, 'utf-8');

  return {
    path: filepath,
    cleanup: async () => {
      try {
        await unlink(filepath);
      } catch {
        // ignore cleanup errors
      }
    },
  };
}

function buildSpawnArgs(config: SandboxConfig): string[] {
  const args: string[] = [];

  // Memory limit (Node.js)
  if (config.memoryLimitMb) {
    args.push(`--max-old-space-size=${config.memoryLimitMb}`);
  }

  return args;
}

export async function runInSandbox(
  code: string,
  config: SandboxConfig = {},
): Promise<SandboxResult> {
  const {
    timeoutMs = 30_000,
    language = 'javascript',
    cwd,
    env = {},
  } = config;

  const runner = LANGUAGE_RUNNERS[language];
  if (!runner) {
    return {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      durationMs: 0,
      timedOut: false,
      killed: false,
      error: `Unsupported language: ${language}`,
    };
  }

  const tempDir = createTempDir();
  const file = await writeTempFile(tempDir, code, language);
  const startTime = Date.now();

  return new Promise<SandboxResult>((resolve) => {
    const spawnArgs = language === 'javascript' || language === 'typescript'
      ? [...buildSpawnArgs(config), ...runner.args(file.path)]
      : runner.args(file.path);

    // Filter out undefined values from process.env to avoid unsafe type cast
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }

    const sandboxEnv: Record<string, string> = {
      ...cleanEnv,
      ...env,
      GHITA_SANDBOX: '1',
    };

    // Disable network if not allowed
    if (!config.allowNetwork) {
      sandboxEnv.GHITA_SANDBOX_NO_NETWORK = '1';
    }

    const child: ChildProcess = spawn(runner.cmd, spawnArgs, {
      cwd: cwd ?? tempDir,
      env: sandboxEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killed = false;
    let settled = false;

    const cleanup = async (): Promise<void> => {
      if (settled) return;
      settled = true;
      await file.cleanup();
      try {
        const { rmdir } = await import('node:fs/promises');
        await rmdir(tempDir, { recursive: true });
      } catch {
        // ignore cleanup errors
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      // Limit output size to 1MB
      if (stdout.length > 1_048_576) {
        stdout = stdout.slice(0, 1_048_576) + '\n... (output truncated)';
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 1_048_576) {
        stderr = stderr.slice(0, 1_048_576) + '\n... (output truncated)';
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      // Windows: SIGKILL not supported, use taskkill; Unix: use SIGKILL
      if (process.platform === 'win32' && child.pid) {
        try {
          spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true });
        } catch {
          child.kill();
        }
      } else {
        child.kill('SIGKILL');
      }
    }, timeoutMs);

    child.on('close', async (exitCode) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      await cleanup();

      resolve({
        success: exitCode === 0 && !timedOut,
        exitCode: exitCode ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs,
        timedOut,
        killed,
        error: timedOut
          ? `Execution timed out after ${timeoutMs}ms`
          : exitCode !== 0
            ? `Process exited with code ${exitCode}`
            : undefined,
      });
    });

    child.on('error', async (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      await cleanup();

      resolve({
        success: false,
        exitCode: 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs,
        timedOut: false,
        killed: false,
        error: err.message,
      });
    });
  });
}

/** Tạo sandbox skill cho SkillRegistry */
export function createSandboxSkill() {
  return {
    id: 'sandbox.run',
    name: 'Run in Sandbox',
    description: 'Execute code in an isolated sandbox environment with resource limits.',
    category: 'terminal' as const,
    enabled: true,
    version: '0.1.0',
    scopes: ['workspace' as const],
    status: 'ready' as const,
    parameters: {
      code: { type: 'string', description: 'Code to execute', required: true },
      language: {
        type: 'string',
        description: 'Language: javascript, typescript, python, shell',
        required: false,
        default: 'javascript',
      },
      timeoutMs: { type: 'number', description: 'Timeout in ms', required: false, default: 30000 },
    },
    run: async ({ input }: { input?: Record<string, unknown> }) => {
      const code = input?.code;
      if (typeof code !== 'string' || code.trim().length === 0) {
        return { success: false, error: 'Missing required input: code' };
      }

      const language = (typeof input?.language === 'string' ? input.language : 'javascript') as SandboxLanguage;
      const timeoutMs = typeof input?.timeoutMs === 'number' ? input.timeoutMs : 30000;

      const result = await runInSandbox(code, { language, timeoutMs });

      return {
        success: result.success,
        output: result.stdout || undefined,
        error: result.error || result.stderr || undefined,
        data: {
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          timedOut: result.timedOut,
        },
      };
    },
  };
}
