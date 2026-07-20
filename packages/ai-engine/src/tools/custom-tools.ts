// ==============================================================================
// GHITA CODING AGENT - Custom Tool Builder
// ==============================================================================
// Cho phép user định nghĩa tool từ JSON Schema + handler function, validate
// arguments trước khi execute, và register vào ToolRegistry.
// Pattern lấy cảm hứng Composio: declarative tool definition + runtime wiring.
// ==============================================================================

import { getDefaultRegistry } from './registry.js';
import type {
  ToolDefinition,
  ToolParameterSchema,
  ToolPropertySpec,
  ToolSource,
} from './registry.js';

// ----------------------------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------------------------

export class ToolValidationError extends Error {
  constructor(
    public path: string,
    public reason: string,
  ) {
    super(`Validation error at "${path}": ${reason}`);
    this.name = 'ToolValidationError';
  }
}

/** Validate value theo JSON Schema (subset) */
export function validateArgs(
  schema: ToolParameterSchema,
  args: Record<string, unknown>,
  path = 'args',
): void {
  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in args) || args[key] === undefined || args[key] === null) {
        throw new ToolValidationError(`${path}.${key}`, 'required field missing');
      }
    }
  }

  for (const [key, spec] of Object.entries(schema.properties)) {
    if (!(key in args)) continue;
    const value = args[key];
    if (value === undefined || value === null) continue;
    const fieldPath = `${path}.${key}`;
    const expected = spec.type;

    if (expected === 'string' && typeof value !== 'string') {
      throw new ToolValidationError(fieldPath, `expected string, got ${typeof value}`);
    }
    if (expected === 'number' && typeof value !== 'number') {
      throw new ToolValidationError(fieldPath, `expected number, got ${typeof value}`);
    }
    if (expected === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
      throw new ToolValidationError(fieldPath, `expected integer, got ${typeof value}`);
    }
    if (expected === 'boolean' && typeof value !== 'boolean') {
      throw new ToolValidationError(fieldPath, `expected boolean, got ${typeof value}`);
    }
    if (expected === 'array' && !Array.isArray(value)) {
      throw new ToolValidationError(fieldPath, `expected array, got ${typeof value}`);
    }
    if (expected === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      throw new ToolValidationError(fieldPath, `expected object, got ${typeof value}`);
    }

    if (spec.enum && !spec.enum.includes(value as string | number)) {
      throw new ToolValidationError(fieldPath, `value must be one of: ${spec.enum.join(', ')}`);
    }
  }
}

// ----------------------------------------------------------------------------
// CustomTool class
// ----------------------------------------------------------------------------

export interface CustomToolOptions {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  tags?: string[];
  source?: ToolSource;
  version?: string;
  rateLimit?: number;
  requiresApproval?: boolean;
}

/**
 * Wrapper cho custom tool. Cung cấp builder API:
 *   const tool = new CustomTool({...}).withHandler(async (args) => '...');
 *   registry.register(tool.toDefinition());
 */
export class CustomTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameterSchema;
  tags: string[];
  source: ToolSource;
  version: string;
  rateLimit?: number;
  requiresApproval: boolean;
  private handler: ((args: Record<string, unknown>) => Promise<string>) | null = null;

  constructor(options: CustomToolOptions) {
    if (!options.name || typeof options.name !== 'string') {
      throw new Error('CustomTool: name is required');
    }
    if (!/^[a-z0-9_-]{2,64}$/i.test(options.name)) {
      throw new Error(
        `CustomTool: name "${options.name}" must be 2-64 chars (letters, digits, _, -)`,
      );
    }
    if (!options.description) {
      throw new Error('CustomTool: description is required');
    }
    this.name = options.name;
    this.description = options.description;
    this.parameters = options.parameters;
    this.tags = options.tags ?? ['custom'];
    this.source = options.source ?? 'custom';
    this.version = options.version ?? '1.0.0';
    this.rateLimit = options.rateLimit;
    this.requiresApproval = options.requiresApproval ?? false;
  }

  /** Gắn handler function */
  withHandler(handler: (args: Record<string, unknown>) => Promise<string>): this {
    this.handler = handler;
    return this;
  }

  /** Set tags */
  withTags(tags: string[]): this {
    this.tags = tags;
    return this;
  }

  /** Set rate limit */
  withRateLimit(callsPerMinute: number): this {
    this.rateLimit = callsPerMinute;
    return this;
  }

  /** Mark as requires approval */
  withApproval(requires = true): this {
    this.requiresApproval = requires;
    return this;
  }

  /** Convert sang ToolDefinition để register */
  toDefinition(): ToolDefinition {
    if (!this.handler) {
      throw new Error(
        `CustomTool "${this.name}": handler chưa được set. Dùng .withHandler(...) trước.`,
      );
    }
    const baseHandler = this.handler;
    const wrapped = async (args: Record<string, unknown>) => {
      validateArgs(this.parameters, args);
      return baseHandler(args);
    };
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      execute: wrapped,
      tags: this.tags,
      source: this.source,
      version: this.version,
      rateLimit: this.rateLimit,
      requiresApproval: this.requiresApproval,
    };
  }
}

// ----------------------------------------------------------------------------
// Schema builder helpers
// ----------------------------------------------------------------------------

/** Shorthand: tạo ToolPropertySpec */
export function param(
  type: ToolPropertySpec['type'],
  description: string,
  opts: Partial<Pick<ToolPropertySpec, 'enum' | 'default' | 'items'>> = {},
): ToolPropertySpec {
  return { type, description, ...opts };
}

/** Shorthand: tạo ToolParameterSchema */
export function schema(
  properties: Record<string, ToolPropertySpec>,
  required: string[] = [],
): ToolParameterSchema {
  return { type: 'object', properties, required };
}

// ----------------------------------------------------------------------------
// Builder functions
// ----------------------------------------------------------------------------

/** Define custom tool từ options + handler. Auto-register vào default registry. */
export function defineCustomTool(
  options: CustomToolOptions,
  handler: (args: Record<string, unknown>) => Promise<string>,
): CustomTool {
  const tool = new CustomTool(options).withHandler(handler);
  getDefaultRegistry().register(tool.toDefinition());
  return tool;
}

/** Tạo tool từ declarative config (dùng cho config-driven setup) */
export interface DeclarativeTool {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  tags?: string[];
  source?: ToolSource;
  version?: string;
  rateLimit?: number;
  requiresApproval?: boolean;
  handler:
    | { type: 'http'; method: string; urlTemplate: string; headers?: Record<string, string> }
    | { type: 'shell'; commandTemplate: string; timeoutMs?: number }
    | { type: 'function'; fn: (args: Record<string, unknown>) => Promise<string> };
}

/** Expand template string với args (vd: "https://api.example.com/{id}") */
function expandTemplate(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = args[key];
    if (v === undefined) throw new Error(`Template variable "${key}" not provided in args`);
    return encodeURIComponent(String(v));
  });
}

/** Compile declarative tool thành CustomTool */
export function compileDeclarativeTool(spec: DeclarativeTool): CustomTool {
  let handler: (args: Record<string, unknown>) => Promise<string>;
  switch (spec.handler.type) {
    case 'http': {
      const httpHandler = spec.handler;
      handler = async (args) => {
        const url = expandTemplate(httpHandler.urlTemplate, args);
        const method = httpHandler.method.toUpperCase();
        const headers: Record<string, string> = { ...(httpHandler.headers ?? {}) };
        const body = ['POST', 'PUT', 'PATCH'].includes(method) ? JSON.stringify(args) : undefined;
        if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
        const res = await globalThis.fetch(url, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        const text = await res.text();
        return text.length > 8000 ? `${text.substring(0, 8000)}...[truncated]` : text;
      };
      break;
    }
    case 'shell': {
      const shellHandler = spec.handler;
      handler = async (handlerArgs) => {
        const command = expandTemplate(shellHandler.commandTemplate, handlerArgs);
        const { spawn } = await import('node:child_process');
        // Parse thành argv để tránh shell injection
        const argv = command.trim().split(/\s+/).filter(Boolean);
        let program = argv[0];
        let spawnArgs = argv.slice(1);
        if (!program) {
          return Promise.reject(new Error('Empty command'));
        }

        // On Windows, .bat/.cmd files need to be run with cmd /c
        if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(program)) {
          spawnArgs = ['/c', program, ...spawnArgs];
          program = 'cmd.exe';
        }

        return new Promise<string>((resolve, reject) => {
          const proc = spawn(program, spawnArgs, {
            shell: false,
            windowsHide: true, // Prevent console window flash on Windows
          });
          const procAny = proc as ReturnType<typeof spawn>;
          let stdout = '';
          let stderr = '';
          const timer = setTimeout(() => {
            // On Windows, use taskkill to kill process tree
            if (process.platform === 'win32' && procAny.pid) {
              spawn('taskkill', ['/F', '/T', '/PID', String(procAny.pid)], { windowsHide: true });
            } else {
              procAny.kill();
            }
          }, shellHandler.timeoutMs ?? 30_000);
          procAny.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
          procAny.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
          procAny.on('close', (code: number | null) => {
            clearTimeout(timer);
            if (code === 0) resolve(stdout);
            else reject(new Error(`Command failed (${code}): ${stderr}`));
          });
          procAny.on('error', (err: Error) => {
            clearTimeout(timer);
            reject(err);
          });
        });
      };
      break;
    }
    case 'function':
      handler = spec.handler.fn;
      break;
    default:
      throw new Error(`Unknown handler type`);
  }

  return new CustomTool({
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    tags: spec.tags,
    source: spec.source,
    version: spec.version,
    rateLimit: spec.rateLimit,
    requiresApproval: spec.requiresApproval,
  }).withHandler(handler);
}

/** Register declarative tool vào default registry */
export function registerDeclarativeTool(spec: DeclarativeTool): CustomTool {
  const tool = compileDeclarativeTool(spec);
  getDefaultRegistry().register(tool.toDefinition());
  return tool;
}
