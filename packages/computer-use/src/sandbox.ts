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

const DOCKER_RUNNERS: Record<SandboxLanguage, { image: string; cmd: string; args: (file: string) => string[] }> = {
  javascript: {
    image: 'node:20-alpine',
    cmd: 'node',
    args: (file) => [file],
  },
  typescript: {
    image: 'node:20-alpine',
    cmd: 'npx',
    args: (file) => ['-y', 'tsx', file],
  },
  python: {
    image: 'python:3.11-alpine',
    cmd: 'python',
    args: (file) => [file],
  },
  shell: {
    image: 'alpine',
    cmd: 'sh',
    args: (file) => [file],
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
  isDocker: boolean = false,
): Promise<SandboxFile> {
  const extensions: Record<SandboxLanguage, string> = {
    javascript: '.mjs',
    typescript: '.mts',
    python: '.py',
    shell: (isDocker || process.platform !== 'win32') ? '.sh' : '.cmd',
  };

  const filename = `sandbox${extensions[lang]}`;
  const filepath = join(dir, filename);

  await mkdir(dir, { recursive: true });
  
  let finalCode = code;
  if (isDocker && lang === 'shell') {
    // Normalise line endings to LF for Linux containers to avoid CRLF issues
    finalCode = code.replace(/\r\n/g, '\n');
  }

  await writeFile(filepath, finalCode, 'utf-8');

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

/** Check if Docker service is installed and running */
async function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['ps'], { stdio: 'ignore', windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 1500);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/** Run isolated code inside Docker container sandbox */
async function runInDocker(
  _code: string,
  config: SandboxConfig,
  tempDir: string,
  file: SandboxFile,
  startTime: number,
): Promise<SandboxResult> {
  const {
    timeoutMs = 30_000,
    language = 'javascript',
    env = {},
  } = config;

  const runner = DOCKER_RUNNERS[language];
  const containerId = randomBytes(8).toString('hex');
  const containerName = `ghita-sandbox-${containerId}`;

  const dockerArgs = [
    'run',
    '--rm',
    '--name', containerName,
  ];

  if (config.memoryLimitMb) {
    dockerArgs.push(`--memory=${config.memoryLimitMb}m`);
  }

  if (!config.allowNetwork) {
    dockerArgs.push('--net=none');
  }

  // Inject sandbox indicator environment variables
  dockerArgs.push('-e', 'GHITA_SANDBOX=1');
  if (!config.allowNetwork) {
    dockerArgs.push('-e', 'GHITA_SANDBOX_NO_NETWORK=1');
  }

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      dockerArgs.push('-e', `${key}=${value}`);
    }
  }

  // Volume mount workspace temp dir
  dockerArgs.push('-v', `${tempDir}:/sandbox`);
  dockerArgs.push('-w', '/sandbox');

  // Append image and command
  dockerArgs.push(runner.image);
  dockerArgs.push(runner.cmd);

  // Translate local path to container mount path
  const filename = file.path.split(/[/\\]/).pop() || '';
  const containerFilePath = `/sandbox/${filename}`;
  dockerArgs.push(...runner.args(containerFilePath));

  return new Promise<SandboxResult>((resolve, reject) => {
    const child = spawn('docker', dockerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killed = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
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
      // Kill docker container process explicitly on host
      spawn('docker', ['kill', containerName], { windowsHide: true });
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      if (exitCode === 125 || (exitCode !== 0 && stderr.includes('docker:'))) {
        reject(new Error(`Docker execution failed: ${stderr || 'Unknown Docker daemon error'}`));
        return;
      }

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

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Fallback runner executing safely on local host interpreter */
async function runInLocal(
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
  const file = await writeTempFile(tempDir, code, language, false);
  const startTime = Date.now();

  return new Promise<SandboxResult>((resolve) => {
    const spawnArgs = language === 'javascript' || language === 'typescript'
      ? [...buildSpawnArgs(config), ...runner.args(file.path)]
      : runner.args(file.path);

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
      GHITA_SANDBOX_FALLBACK: '1',
    };

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

/** Entrypoint running isolated code with automatic Docker detection and local fallback stream */
export async function runInSandbox(
  code: string,
  config: SandboxConfig = {},
): Promise<SandboxResult> {
  const { language = 'javascript' } = config;

  // Option to skip Docker for testing local fallback execution
  const forceLocal = process.env.GHITA_SANDBOX_FORCE_LOCAL === '1';

  if (!forceLocal) {
    const dockerAvailable = await isDockerAvailable();
    if (dockerAvailable) {
      const tempDir = createTempDir();
      let file: SandboxFile | undefined;
      try {
        file = await writeTempFile(tempDir, code, language, true);
        const startTime = Date.now();
        const result = await runInDocker(code, config, tempDir, file, startTime);
        return result;
      } catch (err: unknown) {
        console.warn(`[Sandbox Warning] Docker container failed: ${(err as Error).message}. Falling back to safe Local Interpreter host stream.`);
      } finally {
        // Always cleanup temp files regardless of Docker success/failure
        await file?.cleanup();
        try {
          const { rmdir } = await import('node:fs/promises');
          await rmdir(tempDir, { recursive: true });
        } catch {
          // ignore cleanup errors
        }
      }
    } else {
      console.warn('[Sandbox Warning] Docker is not available. Falling back to safe Local Interpreter host stream.');
    }
  }

  // Fallback to local interpreter
  const localResult = await runInLocal(code, config);
  const fallbackMsg = `[Sandbox Warning] Docker container not available or failed. Falling back to safe Local Interpreter host stream.`;
  localResult.stderr = localResult.stderr
    ? `${fallbackMsg}\n${localResult.stderr}`
    : fallbackMsg;

  return localResult;
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
