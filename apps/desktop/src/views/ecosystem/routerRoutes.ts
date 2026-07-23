// Extracted from EcosystemView (v0.1.5)
export interface RouterRoute {
  provider: string;
  model: string;
  complexity: 'simple' | 'medium' | 'high';
  costPer1kToken: number; // in USD
  latencyMs: number;
  status: 'active' | 'backup' | 'disabled';
}

export const INITIAL_ROUTER_ROUTES: RouterRoute[] = [
  {
    provider: 'ollama',
    model: 'llama3:8b (Local)',
    complexity: 'simple',
    costPer1kToken: 0.0,
    latencyMs: 80,
    status: 'active',
  },
  {
    provider: 'google',
    model: 'gemini-1.5-flash',
    complexity: 'simple',
    costPer1kToken: 0.000075,
    latencyMs: 220,
    status: 'active',
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    complexity: 'medium',
    costPer1kToken: 0.00015,
    latencyMs: 380,
    status: 'active',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    complexity: 'high',
    costPer1kToken: 0.003,
    latencyMs: 740,
    status: 'active',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    complexity: 'high',
    costPer1kToken: 0.005,
    latencyMs: 690,
    status: 'backup',
  },
];
