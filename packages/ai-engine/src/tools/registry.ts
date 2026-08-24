// In-memory registry ho tro 200+ tool slots, dung cho AI function calling.
// Moi tool co metadata (name, description, parameters) + handler function.
// Pattern lay cam hung tu Composio: dynamic registration + capability tags.

import { createBuiltInTools } from './index.js';
import type {
  ToolDefinition,
  ToolSource,
  ToolExecutionResult,
  RegistryEvent,
  RegistryListener,
} from './registry-types.js';

// Re-export everything for backward compatibility
export * from './registry-types.js';
export { TOOL_CATALOG, loadComposioCatalog } from './registry-catalog.js';

// ToolRegistry Class

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private listeners = new Set<RegistryListener>();
  /** Track call count per tool for rate limiting */
  private callCounts = new Map<string, number[]>();

  /** So tool hien co trong registry */
  get size(): number {
    return this.tools.size;
  }

  /** List tat ca tool names */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Get toan bo definitions (cho AI function calling) */
  definitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** Lay 1 tool theo name */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Check tool ton tai */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Tim tool theo tag (vd: 'saas:gmail', 'file', 'web') */
  findByTag(tag: string): ToolDefinition[] {
    return this.definitions().filter((t) => t.tags.includes(tag));
  }

  /** Tim tool theo source */
  findBySource(source: ToolSource): ToolDefinition[] {
    return this.definitions().filter((t) => t.source === source);
  }

  /** Tim tool theo keyword (search trong name + description) */
  search(keyword: string): ToolDefinition[] {
    const lower = keyword.toLowerCase();
    return this.definitions().filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.description.toLowerCase().includes(lower) ||
        t.tags.some((tag) => tag.toLowerCase().includes(lower)),
    );
  }

  /** List tools theo category (rut ra tu tag prefix vd 'saas:', 'dev:', 'file:') */
  listCategories(): string[] {
    const cats = new Set<string>();
    for (const t of this.tools.values()) {
      for (const tag of t.tags) {
        const prefix = tag.split(':')[0];
        if (prefix) cats.add(prefix);
      }
    }
    return Array.from(cats).sort();
  }

  /** Register 1 tool (idempotent - ghi de neu trung name) */
  register(tool: ToolDefinition): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool name is required');
    }
    if (typeof tool.execute !== 'function') {
      throw new Error(`Tool "${tool.name}" must have an execute function`);
    }
    if (!tool.tags) tool.tags = [];
    if (!tool.source) tool.source = 'custom';
    if (!tool.version) tool.version = '1.0.0';

    this.tools.set(tool.name, tool);
    this.emit({ type: 'register', tool });
  }

  /** Register nhieu tool cung luc */
  registerMany(tools: ToolDefinition[]): void {
    for (const t of tools) this.register(t);
  }

  /** Unregister tool theo name */
  unregister(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) this.emit({ type: 'unregister', name });
    return existed;
  }

  /** Update tool definition (alias cho register) */
  update(tool: ToolDefinition): void {
    this.register(tool);
    this.emit({ type: 'update', tool });
  }

  /** Execute tool voi safety + rate limit + approval check */
  async execute(
    name: string,
    args: Record<string, unknown>,
    options: { skipApproval?: boolean; skipRateLimit?: boolean } = {},
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    const start = Date.now();
    if (!tool) {
      return {
        ok: false,
        output: '',
        durationMs: 0,
        tool: name,
        error: `Tool "${name}" not found in registry`,
      };
    }

    // Rate limit check
    if (!options.skipRateLimit && tool.rateLimit) {
      const now = Date.now();
      const minute = 60_000;
      const recent = (this.callCounts.get(name) ?? []).filter((t) => now - t < minute);
      if (recent.length >= tool.rateLimit) {
        return {
          ok: false,
          output: '',
          durationMs: 0,
          tool: name,
          error: `Rate limit exceeded for "${name}" (${tool.rateLimit}/min)`,
        };
      }
      recent.push(now);
      this.callCounts.set(name, recent);
    }

    // Approval hook
    if (!options.skipApproval && tool.requiresApproval) {
      const hook = (globalThis as { approveCommandHandler?: (cmd: string) => Promise<boolean> })
        .approveCommandHandler;
      if (hook) {
        const approved = await hook(`tool:${name}`).catch(() => false);
        if (!approved) {
          return {
            ok: false,
            output: '',
            durationMs: 0,
            tool: name,
            error: `Tool "${name}" requires user approval (denied)`,
          };
        }
      }
    }

    try {
      const output = await tool.execute(args);
      return {
        ok: true,
        output: typeof output === 'string' ? output : JSON.stringify(output),
        durationMs: Date.now() - start,
        tool: name,
      };
    } catch (err) {
      return {
        ok: false,
        output: '',
        durationMs: Date.now() - start,
        tool: name,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Snapshot toan bo registry (for persistence/inspection) */
  snapshot(): Array<Omit<ToolDefinition, 'execute'> & { executeHash: string }> {
    return this.definitions().map(({ execute, ...rest }) => ({
      ...rest,
      executeHash: execute.toString().length.toString(36),
    }));
  }

  /** Subscribe event */
  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RegistryEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // swallow listener errors
      }
    }
  }

  /** Clear toan bo registry */
  clear(): void {
    const names = this.list();
    this.tools.clear();
    this.callCounts.clear();
    for (const n of names) this.emit({ type: 'unregister', name: n });
  }
}

// Built-in tools loader

/** Register san 7 built-in tools (web_search, web_fetch, list_dir, read_file, write_file, replace_file_content, grep_search, run_command) */
export function loadBuiltInTools(registry: ToolRegistry): number {
  const builtins = createBuiltInTools();
  const defs: ToolDefinition[] = builtins.map((b) => ({
    ...b,
    tags: ['builtin', b.name.split('_')[0] ?? 'misc'],
    source: 'builtin' as ToolSource,
    version: '1.0.0',
  }));
  registry.registerMany(defs);
  return defs.length;
}

// Singleton accessor

let _defaultRegistry: ToolRegistry | null = null;

/** Lay default registry (lazy init voi built-ins) */
export function getDefaultRegistry(): ToolRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = new ToolRegistry();
    loadBuiltInTools(_defaultRegistry);
  }
  return _defaultRegistry;
}

/** Reset default registry (dung cho test) */
export function resetDefaultRegistry(): void {
  _defaultRegistry?.clear();
  _defaultRegistry = null;
}
