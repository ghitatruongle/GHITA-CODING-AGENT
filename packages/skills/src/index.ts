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
  captureScreen?: () => Promise<{ mimeType: string; data: string; width?: number; height?: number }>;
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

function readStringArray(input: Record<string, unknown> | undefined, key: string): string[] | undefined {
  const value = input?.[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : undefined;
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
      status: enabled ? skill.status === 'disabled' ? 'ready' : skill.status : 'disabled',
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
      return await skill.run(invocation, {
        registry: this,
        adapters: this.adapters,
        now: Date.now,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
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
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
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
        return ok(`Wrote ${content.length} characters to ${path}.`, { path, bytes: content.length });
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
        path: { type: 'string', description: 'Directory path to list', required: true, default: '.' },
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
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds', required: false, default: 30000 },
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
          error: result.exitCode === 0 ? undefined : result.stderr || `Command exited with ${result.exitCode}`,
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

// --- Phase 6A: Slash Commands ---
export { SlashCommandRegistry } from './commands/registry.js';
export type { SlashCommand } from './commands/registry.js';
export { createBuiltinSlashCommands } from './commands/builtins.js';

// --- Phase 2: Skills Auto-Creation & Hub Registry ---
export * from './auto-create/types.js';
export { SkillAutoCreator } from './auto-create/engine.js';
export { SkillImprover } from './auto-create/improver.js';


