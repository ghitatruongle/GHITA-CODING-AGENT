// ==============================================================================
// GHITA CODING AGENT - AI Engine v1.1.0 Track 4 P51: model roles routing
// ==============================================================================
// Maps semantic roles (smol/fast/plan/vision/advisor/orchestrator/critic/
// editor/browser/creative) to provider-model priority chains with fallback.
// ==============================================================================

export const MODEL_ROLES = [
  'smol',
  'fast',
  'plan',
  'vision',
  'advisor',
  'orchestrator',
  'critic',
  'editor',
  'browser',
  'creative',
] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];

export interface RoleConfig {
  role: ModelRole;
  /** Priority chain: "provider:model" entries, best first. */
  providers: string[];
  /** Optional description of when to use this role. */
  description?: string;
}

export interface ModelRoleRouterOptions {
  /** Default priority chains per role (built-in defaults below). */
  chains?: Record<ModelRole, string[]>;
  /** Available model ids (e.g. from provider discovery) as "provider:model". */
  available?: string[];
}

export const DEFAULT_ROLE_CHAINS: Record<ModelRole, string[]> = {
  smol: ['openai:gpt-4o-mini', 'anthropic:claude-haiku-4', 'google:gemini-2.0-flash'],
  fast: ['anthropic:claude-sonnet-4', 'openai:gpt-4o', 'google:gemini-2.0-flash'],
  plan: ['anthropic:claude-opus-4', 'openai:gpt-4.1', 'anthropic:claude-sonnet-4'],
  vision: ['anthropic:claude-sonnet-4', 'openai:gpt-4o', 'google:gemini-2.0-flash'],
  advisor: ['anthropic:claude-opus-4', 'openai:gpt-4.1', 'anthropic:claude-sonnet-4'],
  orchestrator: ['anthropic:claude-sonnet-4', 'openai:gpt-4o'],
  critic: ['anthropic:claude-sonnet-4', 'openai:gpt-4o'],
  editor: ['openai:gpt-4o', 'anthropic:claude-sonnet-4'],
  browser: ['anthropic:claude-sonnet-4', 'openai:gpt-4o'],
  creative: ['anthropic:claude-sonnet-4', 'google:gemini-2.0-flash', 'openai:gpt-4o'],
};

export interface RoleResolution {
  role: ModelRole;
  /** Chosen model id ("provider:model"). */
  model?: string;
  /** The full chain after filtering unavailable models. */
  chain: string[];
  reason: string;
}

export class ModelRoleRouter {
  private readonly chains: Record<ModelRole, string[]>;
  private readonly available: Set<string>;

  constructor(options: ModelRoleRouterOptions = {}) {
    this.chains = options.chains ?? DEFAULT_ROLE_CHAINS;
    this.available = new Set(options.available ?? []);
  }

  /** Register available models (in addition to the constructor list). */
  addAvailable(models: string[]): void {
    for (const m of models) this.available.add(m);
  }

  /** True when the availability set is empty → treat everything as available. */
  private allAvailable(): boolean {
    return this.available.size === 0;
  }

  /** Resolve the best available model for a role (fallback chain). */
  resolve(role: ModelRole): RoleResolution {
    const chain = this.chains[role] ?? [];
    if (chain.length === 0) {
      return { role, chain: [], reason: `no chain configured for role "${role}"` };
    }
    if (this.allAvailable()) {
      return {
        role,
        model: chain[0],
        chain,
        reason: `no availability filter — using first of chain`,
      };
    }
    const available = chain.filter((m) => this.available.has(m));
    if (available.length > 0) {
      return { role, model: available[0], chain: available, reason: `matched "${available[0]}"` };
    }
    return {
      role,
      chain: [],
      reason: `no available model for role "${role}" (tried ${chain.join(', ')})`,
    };
  }

  /** Resolve for every role (for pre-warming / status views). */
  resolveAll(): RoleResolution[] {
    return MODEL_ROLES.map((role) => this.resolve(role));
  }

  /** Full fallback chain for a role (availability-filtered). */
  fallbackChain(role: ModelRole): string[] {
    const chain = this.chains[role] ?? [];
    if (this.allAvailable()) return chain;
    return chain.filter((m) => this.available.has(m));
  }
}

/** Simple helper: normalize "model-name" to "provider:model" when provider omitted. */
export function qualifyModelId(provider: string, model: string): string {
  return model.includes(':') ? model : `${provider}:${model}`;
}
