// Registry of browser actions with metadata (terminates-sequence, domains,
// output type) + custom action support (browser-use pattern).

export interface ActionDefinition {
  name: string;
  description: string;
  /** True when this action ends the agent sequence. */
  terminatesSequence?: boolean;
  /** Domains this action applies to (empty = any). */
  domains?: string[];
  /** Expected output shape (for the verifier). */
  output?: 'none' | 'text' | 'element' | 'navigation';
  paramsSchema?: Record<string, unknown>;
  execute?: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ActionRegistryOptions {
  /** Predefined built-in actions. */
  defaults?: ActionDefinition[];
}

export const BUILTIN_ACTIONS: ActionDefinition[] = [
  {
    name: 'click',
    description: 'Click an element',
    terminatesSequence: true,
    output: 'element',
    paramsSchema: { selector: { type: 'string' } },
  },
  {
    name: 'fill',
    description: 'Fill a form field',
    output: 'element',
    paramsSchema: { selector: { type: 'string' }, value: { type: 'string' } },
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL',
    output: 'navigation',
    paramsSchema: { url: { type: 'string' } },
  },
  { name: 'scroll', description: 'Scroll the page', output: 'none' },
  { name: 'extract', description: 'Extract text or data', output: 'text' },
  { name: 'screenshot', description: 'Take a screenshot', output: 'none' },
  { name: 'wait', description: 'Wait for a condition', output: 'none' },
  { name: 'submit', description: 'Submit a form', terminatesSequence: true, output: 'navigation' },
];

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();

  constructor(options: ActionRegistryOptions = {}) {
    for (const action of options.defaults ?? BUILTIN_ACTIONS) {
      this.register(action);
    }
  }

  register(action: ActionDefinition): void {
    if (!action.name) throw new Error('action requires a name');
    this.actions.set(action.name, action);
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  /** Actions allowed for a given domain (empty domain = any). */
  forDomain(domain: string | undefined): ActionDefinition[] {
    return [...this.actions.values()].filter(
      (a) =>
        !a.domains ||
        a.domains.length === 0 ||
        (domain !== undefined && a.domains.includes(domain)),
    );
  }

  list(): ActionDefinition[] {
    return [...this.actions.values()];
  }

  /** Validate args against the params schema (basic). */
  validate(name: string, args: Record<string, unknown>): { ok: boolean; error?: string } {
    const action = this.actions.get(name);
    if (!action) return { ok: false, error: `unknown action: ${name}` };
    const schema = action.paramsSchema ?? {};
    for (const [key, spec] of Object.entries(schema)) {
      const type = (spec as { type?: string })?.type;
      if (args[key] === undefined && (spec as { required?: boolean })?.required) {
        return { ok: false, error: `missing required param: ${key}` };
      }
      if (args[key] !== undefined && type === 'string' && typeof args[key] !== 'string') {
        return { ok: false, error: `param "${key}" must be a string` };
      }
    }
    return { ok: true };
  }
}
