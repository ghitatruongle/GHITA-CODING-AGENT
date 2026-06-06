// ==============================================================================
// GHITA CODING AGENT — Dynamic Prompt Complexity & Cost LLM Router
// ==============================================================================

export type ComplexityLevel = 'simple' | 'medium' | 'high';

export interface RouteResolution {
  provider: string;
  model: string;
  complexity: ComplexityLevel;
  reason: string;
  estimatedCostUsd: number;
}

export class AgentRouter {
  private maxCostThreshold: number;
  private boundaryMode: string;

  constructor(maxCostThreshold = 0.05, boundaryMode = 'automatic') {
    this.maxCostThreshold = maxCostThreshold;
    this.boundaryMode = boundaryMode;
  }

  /**
   * Analyze prompt strings to heuristically estimate complexity level
   */
  public estimateComplexity(prompt: string): ComplexityLevel {
    if (this.boundaryMode === 'low-cost-forced') return 'simple';
    if (this.boundaryMode === 'high-performance-forced') return 'high';

    const cleanPrompt = prompt.toLowerCase().trim();

    // Check for architectural or structural keywords
    const highComplexityKeywords = [
      'refactor',
      'architect',
      'design pattern',
      'optimize database',
      'multi-file',
      'monorepo',
      'system design',
      'setup project',
      'dockerize',
    ];

    const mediumComplexityKeywords = [
      'fix bug',
      'write test',
      'implement function',
      'parse json',
      'regex',
      'script',
      'query postgres',
      'create component',
    ];

    const hasHighKeywords = highComplexityKeywords.some((k) => cleanPrompt.includes(k));
    const hasMediumKeywords = mediumComplexityKeywords.some((k) => cleanPrompt.includes(k));

    // Length-based heuristic
    const wordCount = cleanPrompt.split(/\s+/).length;

    if (hasHighKeywords || wordCount > 250 || cleanPrompt.length > 1500) {
      return 'high';
    }

    if (hasMediumKeywords || wordCount > 50 || cleanPrompt.length > 300) {
      return 'medium';
    }

    return 'simple';
  }

  /**
   * Resolve best provider and model based on estimated complexity
   */
  public resolveRoute(prompt: string): RouteResolution {
    const complexity = this.estimateComplexity(prompt);

    switch (complexity) {
      case 'simple':
        return {
          provider: 'ollama',
          model: 'llama3.3:8b',
          complexity,
          reason:
            'Prompt complexity is low (simple query/command). Routed to Local Ollama model to ensure zero API cost.',
          estimatedCostUsd: 0.0,
        };

      case 'medium':
        return {
          provider: 'openai',
          model: 'gpt-4o-mini',
          complexity,
          reason:
            'Prompt complexity is medium (standard feature or bugfix). Routed to cost-efficient cloud model (gpt-4o-mini).',
          estimatedCostUsd: 0.00015,
        };

      case 'high':
      default:
        // Respect maximum budget constraint
        if (this.maxCostThreshold < 0.002) {
          return {
            provider: 'google',
            model: 'gemini-2.0-flash',
            complexity: 'high',
            reason:
              'High complexity detected but restricted by strict Max Cost budget constraint. Routed to cheap Gemini Flash.',
            estimatedCostUsd: 0.000075,
          };
        }

        return {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          complexity,
          reason:
            'High complexity detected (architectural question or heavy file parsing). Routed to premium Claude 3.5 Sonnet.',
          estimatedCostUsd: 0.003,
        };
    }
  }

  public setMaxCostThreshold(threshold: number): void {
    this.maxCostThreshold = threshold;
  }

  public setBoundaryMode(mode: string): void {
    this.boundaryMode = mode;
  }
}
