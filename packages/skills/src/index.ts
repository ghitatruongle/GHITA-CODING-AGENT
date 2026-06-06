// ==============================================================================
// GHITA CODING AGENT - Skills Package
// ==============================================================================

import type { Skill, SkillCategory, SkillResult } from '@ghita/shared';

export const SKILLS_VERSION = '0.1.0';

export type SkillStatus = 'ready' | 'disabled' | 'missing-adapter' | 'error';
export type SkillScope = 'workspace' | 'system' | 'browser' | 'desktop';

export interface SkillInvocation {
  input?: Record<string, unknown>;
  cwd?: string;
  signal?: AbortSignal;
}

export interface SkillExecutionContext {
  registry: SkillRegistry;
  now: () => number;
  adapters: SkillRuntimeAdapters;
}

export interface SkillDefinition extends Skill {
  version: string;
  scopes: SkillScope[];
  status: SkillStatus;
  run: (invocation: SkillInvocation, context: SkillExecutionContext) => Promise<SkillResult>;
}

export interface FileSkillAdapter {
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, content: string) => Promise<void>;
  listDirectory?: (path: string) => Promise<unknown[]>;
}

export interface TerminalSkillAdapter {
  runCommand?: (
    command: string,
    options?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string; duration: number }>;
}

export interface ScreenshotSkillAdapter {
  captureScreen?: () => Promise<{
    mimeType: string;
    data: string;
    width?: number;
    height?: number;
  }>;
}

export interface AppControlSkillAdapter {
  openApp?: (target: string, args?: string[]) => Promise<void>;
  closeApp?: (target: string) => Promise<void>;
}

export interface SkillRuntimeAdapters {
  file?: FileSkillAdapter;
  terminal?: TerminalSkillAdapter;
  screenshot?: ScreenshotSkillAdapter;
  app?: AppControlSkillAdapter;
  onSkillComplete?: (id: string, result: SkillResult) => void | Promise<void>;
}

export interface SkillRegistrySnapshot {
  total: number;
  enabled: number;
  disabled: number;
  byCategory: Record<SkillCategory, number>;
  skills: SkillDefinition[];
}

type SkillSubscriber = (snapshot: SkillRegistrySnapshot) => void;

const CATEGORY_ORDER: SkillCategory[] = [
  'file',
  'terminal',
  'browser',
  'computer',
  'screenshot',
  'app',
];

function createEmptyCategoryCount(): Record<SkillCategory, number> {
  return {
    file: 0,
    terminal: 0,
    browser: 0,
    computer: 0,
    screenshot: 0,
    app: 0,
  };
}

function ok(output: string, data?: unknown): SkillResult {
  return { success: true, output, data };
}

function fail(error: string, data?: unknown): SkillResult {
  return { success: false, error, data };
}

function readString(input: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = input?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(input: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = input?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(
  input: Record<string, unknown> | undefined,
  key: string,
): string[] | undefined {
  const value = input?.[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : undefined;
}

function readBoolean(input: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = input?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function escapeShellArg(arg: string): string {
  if (process.platform === 'win32') {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function missingAdapter(name: string): SkillResult {
  return fail(`${name} adapter is not available in this runtime.`);
}

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();
  private readonly subscribers = new Set<SkillSubscriber>();

  constructor(private readonly adapters: SkillRuntimeAdapters = {}) {}

  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill already registered: ${skill.id}`);
    }
    this.skills.set(skill.id, skill);
    this.emit();
  }

  registerMany(skills: SkillDefinition[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  unregister(id: string): boolean {
    const removed = this.skills.delete(id);
    if (removed) this.emit();
    return removed;
  }

  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  list(): SkillDefinition[] {
    return [...this.skills.values()].sort((a, b) => {
      const categoryDelta = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      return categoryDelta === 0 ? a.name.localeCompare(b.name) : categoryDelta;
    });
  }

  listEnabled(): SkillDefinition[] {
    return this.list().filter((skill) => skill.enabled);
  }

  setEnabled(id: string, enabled: boolean): SkillDefinition {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);

    const updated: SkillDefinition = {
      ...skill,
      enabled,
      status: enabled ? (skill.status === 'disabled' ? 'ready' : skill.status) : 'disabled',
    };

    this.skills.set(id, updated);
    this.emit();
    return updated;
  }

  async run(id: string, invocation: SkillInvocation = {}): Promise<SkillResult> {
    const skill = this.skills.get(id);
    if (!skill) return fail(`Skill not found: ${id}`);
    if (!skill.enabled) return fail(`Skill is disabled: ${id}`);

    try {
      const result = await skill.run(invocation, {
        registry: this,
        adapters: this.adapters,
        now: Date.now,
      });
      if (this.adapters.onSkillComplete) {
        await this.adapters.onSkillComplete(id, result);
      }
      return result;
    } catch (error) {
      const errResult = fail(error instanceof Error ? error.message : String(error));
      if (this.adapters.onSkillComplete) {
        await this.adapters.onSkillComplete(id, errResult);
      }
      return errResult;
    }
  }

  snapshot(): SkillRegistrySnapshot {
    const byCategory = createEmptyCategoryCount();
    const skills = this.list();
    let enabled = 0;

    for (const skill of skills) {
      byCategory[skill.category] += 1;
      if (skill.enabled) enabled += 1;
    }

    return {
      total: skills.length,
      enabled,
      disabled: skills.length - enabled,
      byCategory,
      skills,
    };
  }

  subscribe(subscriber: SkillSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot());
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private emit(): void {
    if (this.subscribers.size === 0) return;
    const snapshot = this.snapshot();
    for (const subscriber of this.subscribers) {
      subscriber(snapshot);
    }
  }

  fork(sessionId: string): SessionSkillRegistry {
    return new SessionSkillRegistry(this, sessionId);
  }
}

export class SessionSkillRegistry {
  private readonly sessionEnabled = new Map<string, boolean>();

  constructor(
    public readonly parent: SkillRegistry,
    public readonly sessionId: string,
  ) {}

  setEnabled(id: string, enabled: boolean): void {
    this.sessionEnabled.set(id, enabled);
  }

  get(id: string): SkillDefinition | undefined {
    const skill = this.parent.get(id);
    if (!skill) return undefined;
    const isEnabled = this.sessionEnabled.has(id)
      ? !!this.sessionEnabled.get(id)
      : skill.enabled;
    return {
      ...skill,
      enabled: isEnabled,
      status: isEnabled ? (skill.status === 'disabled' ? 'ready' : skill.status) : 'disabled',
    };
  }

  list(): SkillDefinition[] {
    return this.parent.list().map((skill) => {
      const isEnabled = this.sessionEnabled.has(skill.id)
        ? !!this.sessionEnabled.get(skill.id)
        : skill.enabled;
      return {
        ...skill,
        enabled: isEnabled,
        status: isEnabled ? (skill.status === 'disabled' ? 'ready' : skill.status) : 'disabled',
      };
    });
  }

  listEnabled(): SkillDefinition[] {
    return this.list().filter((skill) => skill.enabled);
  }

  async run(id: string, invocation: SkillInvocation = {}): Promise<SkillResult> {
    const skill = this.get(id);
    if (!skill) return { success: false, error: `Skill not found: ${id}` };
    if (!skill.enabled) {
      return { success: false, error: `Skill is disabled in session ${this.sessionId}: ${id}` };
    }
    return this.parent.run(id, invocation);
  }
}

export function createBuiltinSkills(): SkillDefinition[] {
  return [
    {
      id: 'file.read',
      name: 'Read File',
      description: 'Read a text file from the current workspace.',
      category: 'file',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        path: { type: 'string', description: 'File path to read', required: true },
      },
      run: async ({ input }, { adapters }) => {
        const path = readString(input, 'path');
        if (!path) return fail('Missing required input: path');
        if (!adapters.file?.readFile) return missingAdapter('File read');
        const content = await adapters.file.readFile(path);
        return ok(content, { path, bytes: content.length });
      },
    },
    {
      id: 'file.write',
      name: 'Write File',
      description: 'Write text content to a workspace file.',
      category: 'file',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        path: { type: 'string', description: 'File path to write', required: true },
        content: { type: 'string', description: 'Text content', required: true },
      },
      run: async ({ input }, { adapters }) => {
        const path = readString(input, 'path');
        const content = readString(input, 'content') ?? '';
        if (!path) return fail('Missing required input: path');
        if (!adapters.file?.writeFile) return missingAdapter('File write');
        await adapters.file.writeFile(path, content);
        return ok(`Wrote ${content.length} characters to ${path}.`, {
          path,
          bytes: content.length,
        });
      },
    },
    {
      id: 'file.list',
      name: 'List Files',
      description: 'List files and folders in a workspace directory.',
      category: 'file',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        path: {
          type: 'string',
          description: 'Directory path to list',
          required: true,
          default: '.',
        },
      },
      run: async ({ input }, { adapters }) => {
        const path = readString(input, 'path') ?? '.';
        if (!adapters.file?.listDirectory) return missingAdapter('File list');
        const entries = await adapters.file.listDirectory(path);
        return ok(`Found ${entries.length} entries in ${path}.`, { path, entries });
      },
    },
    {
      id: 'terminal.run',
      name: 'Run Terminal Command',
      description: 'Run a terminal command and capture stdout/stderr.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace', 'system'],
      status: 'ready',
      parameters: {
        command: { type: 'string', description: 'Command to execute', required: true },
        timeoutMs: {
          type: 'number',
          description: 'Timeout in milliseconds',
          required: false,
          default: 30000,
        },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const command = readString(input, 'command');
        const timeoutMs = readNumber(input, 'timeoutMs') ?? 30000;
        if (!command) return fail('Missing required input: command');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const result = await adapters.terminal.runCommand(command, { cwd, timeoutMs, signal });
        return {
          success: result.exitCode === 0,
          output: result.stdout || result.stderr,
          error:
            result.exitCode === 0
              ? undefined
              : result.stderr || `Command exited with ${result.exitCode}`,
          data: result,
        };
      },
    },
    {
      id: 'screenshot.capture',
      name: 'Capture Screenshot',
      description: 'Capture the current screen for visual analysis.',
      category: 'screenshot',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['desktop'],
      status: 'ready',
      run: async (_invocation, { adapters }) => {
        if (!adapters.screenshot?.captureScreen) return missingAdapter('Screenshot');
        const screenshot = await adapters.screenshot.captureScreen();
        return ok('Screenshot captured.', screenshot);
      },
    },
    {
      id: 'app.open',
      name: 'Open App',
      description: 'Open an app, executable, file, or URL.',
      category: 'app',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'ready',
      parameters: {
        target: { type: 'string', description: 'App path, command, file, or URL', required: true },
        args: { type: 'array', description: 'Optional arguments', required: false },
      },
      run: async ({ input }, { adapters }) => {
        const target = readString(input, 'target');
        const args = readStringArray(input, 'args') ?? [];
        if (!target) return fail('Missing required input: target');
        if (!adapters.app?.openApp) return missingAdapter('App control');
        await adapters.app.openApp(target, args);
        return ok(`Opened ${target}.`, { target, args });
      },
    },
    {
      id: 'app.close',
      name: 'Close App',
      description: 'Request that a named app or process closes.',
      category: 'app',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'disabled',
      parameters: {
        target: { type: 'string', description: 'App or process name', required: true },
      },
      run: async ({ input }, { adapters }) => {
        const target = readString(input, 'target');
        if (!target) return fail('Missing required input: target');
        if (!adapters.app?.closeApp) return missingAdapter('App control');
        await adapters.app.closeApp(target);
        return ok(`Close requested for ${target}.`, { target });
      },
    },
    // ===== Phase 2.1: New Built-in Skills =====
    // --- Git Skills ---
    {
      id: 'git.status',
      name: 'Git Status',
      description: 'Show working tree status.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        porcelain: { type: 'boolean', description: 'Use porcelain format', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const porcelain = readBoolean(input, 'porcelain');
        const cmd = porcelain ? 'git status --porcelain' : 'git status';
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    {
      id: 'git.commit',
      name: 'Git Commit',
      description: 'Record changes to the repository.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        message: { type: 'string', description: 'Commit message', required: true },
        amend: { type: 'boolean', description: 'Amend last commit', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const message = readString(input, 'message');
        if (!message) return fail('Missing required input: message');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const amend = readBoolean(input, 'amend');
        const cmd = amend
          ? `git commit --amend -m ${escapeShellArg(message)}`
          : `git commit -m ${escapeShellArg(message)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: { ...r, message },
        };
      },
    },
    {
      id: 'git.diff',
      name: 'Git Diff',
      description: 'Show changes between commits, working tree, etc.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        target: {
          type: 'string',
          description: 'Diff target (e.g. HEAD, branch name)',
          required: false,
          default: 'HEAD',
        },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const target = readString(input, 'target') ?? 'HEAD';
        const r = await adapters.terminal.runCommand(`git diff ${target}`, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    {
      id: 'git.branch',
      name: 'Git Branch',
      description: 'List, create, or delete branches.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        action: {
          type: 'string',
          description: 'Action: list, create, delete',
          required: false,
          default: 'list',
        },
        name: { type: 'string', description: 'Branch name (for create/delete)', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const action = readString(input, 'action') ?? 'list';
        const name = readString(input, 'name');
        let cmd: string;
        if (action === 'create') {
          if (!name) return fail('Missing required input: name for create action');
          cmd = `git checkout -b ${escapeShellArg(name)}`;
        } else if (action === 'delete') {
          if (!name) return fail('Missing required input: name for delete action');
          cmd = `git branch -d ${escapeShellArg(name)}`;
        } else {
          cmd = 'git branch';
        }
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    // --- Docker Skills ---
    {
      id: 'docker.run',
      name: 'Docker Run',
      description: 'Run a command in a new Docker container.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'disabled',
      parameters: {
        image: { type: 'string', description: 'Docker image name', required: true },
        command: {
          type: 'string',
          description: 'Command to run inside container',
          required: false,
        },
        detach: { type: 'boolean', description: 'Run in detached mode', required: false },
        ports: { type: 'string', description: 'Port mapping (e.g. 8080:80)', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const image = readString(input, 'image');
        if (!image) return fail('Missing required input: image');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const command = readString(input, 'command');
        const detach = readBoolean(input, 'detach');
        const ports = readString(input, 'ports');
        let cmd = 'docker run';
        if (detach) cmd += ' -d';
        if (ports) cmd += ` -p ${ports}`;
        cmd += ` ${escapeShellArg(image)}`;
        if (command) cmd += ` ${command}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    {
      id: 'docker.build',
      name: 'Docker Build',
      description: 'Build a Docker image from a Dockerfile.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'disabled',
      parameters: {
        tag: { type: 'string', description: 'Image tag (e.g. myapp:latest)', required: true },
        context: {
          type: 'string',
          description: 'Build context path',
          required: false,
          default: '.',
        },
        file: { type: 'string', description: 'Dockerfile path', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const tag = readString(input, 'tag');
        if (!tag) return fail('Missing required input: tag');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const context = readString(input, 'context') ?? '.';
        const file = readString(input, 'file');
        let cmd = `docker build -t ${escapeShellArg(tag)}`;
        if (file) cmd += ` -f ${escapeShellArg(file)}`;
        cmd += ` ${escapeShellArg(context)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    {
      id: 'docker.ps',
      name: 'Docker PS',
      description: 'List Docker containers.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'ready',
      parameters: {
        all: {
          type: 'boolean',
          description: 'Show all containers (including stopped)',
          required: false,
        },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const all = readBoolean(input, 'all');
        const cmd = all ? 'docker ps -a' : 'docker ps';
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    // --- DB Skill ---
    {
      id: 'db.query',
      name: 'Database Query',
      description: 'Execute a read-only SQL query on a SQLite database.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        database: { type: 'string', description: 'Path to SQLite database file', required: true },
        query: { type: 'string', description: 'SQL query (SELECT only)', required: true },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const database = readString(input, 'database');
        const query = readString(input, 'query');
        if (!database) return fail('Missing required input: database');
        if (!query) return fail('Missing required input: query');
        if (!query.trim().toUpperCase().startsWith('SELECT'))
          return fail('Only SELECT queries are allowed for safety.');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const r = await adapters.terminal.runCommand(
          `sqlite3 ${database} ${escapeShellArg(query)}`,
          { cwd, signal },
        );
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    // --- HTTP Skill ---
    {
      id: 'http.request',
      name: 'HTTP Request',
      description: 'Make an HTTP request using curl.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'ready',
      parameters: {
        url: { type: 'string', description: 'Request URL', required: true },
        method: {
          type: 'string',
          description: 'HTTP method (GET, POST, etc.)',
          required: false,
          default: 'GET',
        },
        headers: { type: 'string', description: 'Request headers (key:value)', required: false },
        body: { type: 'string', description: 'Request body', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const url = readString(input, 'url');
        if (!url) return fail('Missing required input: url');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const method = readString(input, 'method') ?? 'GET';
        const headers = readString(input, 'headers');
        const body = readString(input, 'body');
        let cmd = `curl -s -X ${method}`;
        if (headers) cmd += ` -H ${escapeShellArg(headers)}`;
        if (body) cmd += ` -d ${escapeShellArg(body)}`;
        cmd += ` ${escapeShellArg(url)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, timeoutMs: 15000, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    // --- Code Quality Skills ---
    {
      id: 'code.format',
      name: 'Format Code',
      description: 'Format code using a configured formatter.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        path: { type: 'string', description: 'File or directory path', required: true },
        formatter: {
          type: 'string',
          description: 'Formatter: prettier, black, rustfmt',
          required: false,
          default: 'prettier',
        },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const path = readString(input, 'path');
        if (!path) return fail('Missing required input: path');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const formatter = readString(input, 'formatter') ?? 'prettier';
        const cmd = `${escapeShellArg(formatter)} --write ${escapeShellArg(path)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: { ...r, formatter },
        };
      },
    },
    {
      id: 'code.lint',
      name: 'Lint Code',
      description: 'Run a linter on the codebase.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        path: { type: 'string', description: 'File or directory path', required: true },
        linter: {
          type: 'string',
          description: 'Linter: eslint, flake8, clippy',
          required: false,
          default: 'eslint',
        },
        fix: { type: 'boolean', description: 'Auto-fix issues', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const path = readString(input, 'path');
        if (!path) return fail('Missing required input: path');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const linter = readString(input, 'linter') ?? 'eslint';
        const fix = readBoolean(input, 'fix');
        let cmd = `${escapeShellArg(linter)} ${escapeShellArg(path)}`;
        if (fix) cmd += ' --fix';
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: { ...r, linter },
        };
      },
    },
    // --- Test Skill ---
    {
      id: 'test.run',
      name: 'Run Tests',
      description: 'Run the test suite.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        framework: {
          type: 'string',
          description: 'Test framework: vitest, jest, pytest, cargo',
          required: false,
          default: 'vitest',
        },
        path: { type: 'string', description: 'Specific test file or directory', required: false },
        watch: { type: 'boolean', description: 'Watch mode', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const framework = readString(input, 'framework') ?? 'vitest';
        const path = readString(input, 'path');
        const watch = readBoolean(input, 'watch');
        let cmd = escapeShellArg(framework);
        if (path) cmd += ` ${path}`;
        if (watch) cmd += ' --watch';
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: { ...r, framework },
        };
      },
    },
    // --- Search Skill ---
    {
      id: 'search.codebase',
      name: 'Search Codebase',
      description: 'Search for patterns in the codebase using ripgrep or grep.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        query: { type: 'string', description: 'Search pattern', required: true },
        path: { type: 'string', description: 'Directory to search', required: false, default: '.' },
        extension: {
          type: 'string',
          description: 'File extension filter (e.g. ts)',
          required: false,
        },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const query = readString(input, 'query');
        if (!query) return fail('Missing required input: query');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const path = readString(input, 'path') ?? '.';
        const extension = readString(input, 'extension');
        let cmd = `rg ${escapeShellArg(query)} ${path}`;
        if (extension) cmd += ` -g "*.${escapeShellArg(extension)}"`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, timeoutMs: 10000, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    // --- Compress Skill ---
    {
      id: 'compress.zip',
      name: 'Compress Files',
      description: 'Create a compressed archive.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        source: { type: 'string', description: 'Source path', required: true },
        output: { type: 'string', description: 'Output archive path', required: true },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const source = readString(input, 'source');
        const output = readString(input, 'output');
        if (!source) return fail('Missing required input: source');
        if (!output) return fail('Missing required input: output');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const isWin = process.platform === 'win32';
        const cmd = isWin
          ? `powershell Compress-Archive -Path ${source} -DestinationPath ${output}`
          : `tar -czf ${escapeShellArg(output)} ${escapeShellArg(source)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || `Created ${output}`,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    // --- Deploy Check Skill ---
    {
      id: 'deploy.check',
      name: 'Deploy Check',
      description: 'Check deployment readiness (clean git, recent commits).',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      run: async ({ cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const status = await adapters.terminal.runCommand('git status --porcelain', {
          cwd,
          signal,
        });
        const log = await adapters.terminal.runCommand('git log --oneline -5', { cwd, signal });
        const isClean = status.stdout.trim().length === 0;
        const output = [
          `Git status: ${isClean ? 'CLEAN' : 'DIRTY'}`,
          status.stdout.trim() ? `\nUncommitted changes:\n${status.stdout}` : '',
          `\nRecent commits:\n${log.stdout}`,
        ].join('');
        return {
          success: isClean,
          output,
          error: isClean ? undefined : 'There are uncommitted changes.',
          data: { isClean, status: status.stdout, log: log.stdout },
        };
      },
    },
  ];
}

export function createDefaultSkillRegistry(adapters: SkillRuntimeAdapters = {}): SkillRegistry {
  const registry = new SkillRegistry(adapters);
  registry.registerMany(createBuiltinSkills());
  return registry;
}

export async function runSkillSequence(
  registry: SkillRegistry,
  steps: Array<{ skillId: string; invocation?: SkillInvocation }>,
): Promise<SkillResult[]> {
  const results: SkillResult[] = [];

  for (const step of steps) {
    const result = await registry.run(step.skillId, step.invocation ?? {});
    results.push(result);
    if (!result.success) break;
  }

  return results;
}

// --- Phase 2: Skills Auto-Creation & Hub Registry ---
export * from './auto-create/types.js';
export { SkillAutoCreator } from './auto-create/engine.js';
export { SkillImprover } from './auto-create/improver.js';

// --- Phase 7: Dynamic Skill Generation Loop ---
export { DynamicSkillGenerator, createSkillsSyncCommand } from './registry/dynamicGenerator.js';

// --- Phase 17: Skill Registry & Composio SaaS Integration ---
export { ComposioSkillAdapter } from './registry/composioAdapter.js';
export type {
  SaaSConnection,
  SaaSAPILog,
  SaaSAPIResponse,
  SaaSCategory,
  SaaSAppDefinition,
  WebhookEvent,
  WebhookHandler,
} from './registry/composioAdapter.js';

// --- Phase 2.3: Skill Marketplace (types + catalog only — no Node.js deps) ---
export { getDefaultCatalog } from './marketplace/defaultCatalog.js';
export type {
  SkillManifest,
  InstalledSkill,
  SkillCatalog,
  CatalogFilters,
  SkillRating,
} from './marketplace/types.js';

// --- Phase 13: Tool Auto-Repair Gate ---
export {
  ToolRepairGate,
  type RepairLLMProvider,
  type ToolRepairOptions,
} from './registry/repair-gate.js';

// --- Phase 2: SKILL.md Manifest Loader & Hot-Reload Watcher ---
export { loadSkillMd, validateSkill, SkillDirectoryWatcher } from './registry/md-loader.js';

// --- Phase 12: Skills Hub + lock.json ---
export {
  HubRegistry,
  SkillGuard,
  LockManager,
  AuditLog,
  createSkillsCommands,
  computeContentHash,
  computeFileHash,
  computeSkillHash,
  resolveTrustLevel,
  normalizeRepoUrl,
  verifySkillHash,
  verifyFileHash,
  checkIntegrity,
  DEFAULT_TRUSTED_REPOS,
  DEFAULT_HUB_CONFIG,
} from './hub/index.js';

export type {
  SkillMeta,
  SkillSource,
  TrustLevel,
  LockEntry,
  LockFile,
  HubConfig,
  HubStats,
  AuditEntry,
  AuditAction,
  VerifyResult,
  IntegrityReport,
} from './hub/index.js';

// --- Phase 25: OAuth Handoff, Keychain Storage, Permission Gates, and toolkitSlug Discovery ---
export {
  OAuthHandoffManager,
  KeychainStore,
  PermissionGateManager,
  discoverToolkitSlug,
} from './registry/oauth-handoff.js';
export type { OAuthSession } from './registry/oauth-handoff.js';

