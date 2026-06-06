// ==============================================================================
// GHITA CODING AGENT - Adaptive Router (Phase 2)
// Complexity-based model selection for optimal cost/quality tradeoff
// ==============================================================================

import type { AIProviderType } from '@ghita/shared';
import type { ChatMessage, ChatOptions } from '../types.js';
import { getModelPricing, type ModelPricing } from '../cost/tracker.js';

// ---------------------------------------------------------------------------
// Complexity Analysis
// ---------------------------------------------------------------------------

/** Complexity tier that maps to a model class */
export type ComplexityTier = 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';

/** Result of analyzing a request's complexity */
export interface ComplexityAnalysis {
  tier: ComplexityTier;
  score: number; // 0-1 normalized complexity score
  factors: ComplexityFactors;
  suggestedModelClass: ModelClass;
}

/** Breakdown of individual complexity signals */
export interface ComplexityFactors {
  promptLength: number; // total chars across all messages
  messageCount: number; // number of messages in conversation
  hasCodeBlocks: boolean; // presence of fenced code blocks
  hasSystemPrompt: boolean; // whether a system prompt is included
  reasoningKeywords: number; // count of reasoning-suggestive keywords
  languageDiversity: number; // estimated vocabulary diversity (0-1)
  avgMessageLength: number; // average chars per message
  hasStructuredOutput: boolean; // user asks for JSON / XML / structured output
  multiTurnDepth: number; // number of assistant turns (conversation depth)
  requiresCreativity: boolean; // creative writing / brainstorm signals
  requiresCodeGeneration: boolean; // code generation signals
}

/** Model class from cheapest to most capable */
export type ModelClass = 'fast' | 'standard' | 'capable' | 'premium' | 'frontier';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AdaptiveRouterConfig {
  /** Override thresholds for tier boundaries (defaults applied if omitted) */
  thresholds?: Partial<Record<ComplexityTier, number>>;
  /** Mapping from model class to preferred model name */
  modelMap?: Partial<Record<ModelClass, string>>;
  /** Mapping from model class to preferred provider */
  providerMap?: Partial<Record<ModelClass, AIProviderType>>;
  /** Minimum score to force premium regardless of other signals (0-1) */
  forcePremiumAbove?: number;
  /** Enable debug logging of complexity analysis */
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Default tier thresholds & model mappings
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS: Record<ComplexityTier, number> = {
  trivial: 0.15,
  simple: 0.35,
  moderate: 0.6,
  complex: 0.8,
  expert: 1.0,
};

const DEFAULT_MODEL_MAP: Record<ModelClass, string> = {
  fast: 'gpt-4o-mini',
  standard: 'gpt-4o',
  capable: 'claude-sonnet-4-20250514',
  premium: 'claude-opus-4-20250514',
  frontier: 'o3',
};

const DEFAULT_PROVIDER_MAP: Record<ModelClass, AIProviderType> = {
  fast: 'openai',
  standard: 'openai',
  capable: 'anthropic',
  premium: 'anthropic',
  frontier: 'openai',
};

// ---------------------------------------------------------------------------
// Reasoning / creativity / code keyword sets
// ---------------------------------------------------------------------------

const REASONING_KEYWORDS = [
  'explain',
  'analyze',
  'reason',
  'think step',
  'compare',
  'evaluate',
  'pros and cons',
  'trade-off',
  'tradeoff',
  'diagnose',
  'debug',
  'architect',
  'design pattern',
  'complex',
  'multi-step',
  'algorithm',
  'prove',
  'derive',
  'calculate',
  'optimize',
  'refactor',
];

const CREATIVITY_KEYWORDS = [
  'write a story',
  'creative',
  'brainstorm',
  'imagine',
  'poem',
  'fiction',
  'narrative',
  'dialogue',
  'script',
  'blog post',
  'essay',
  'marketing copy',
  'slogan',
  'tagline',
];

const CODE_KEYWORDS = [
  'function',
  'class',
  'implement',
  'code',
  'program',
  'algorithm',
  'refactor',
  'debug',
  'api',
  'endpoint',
  'component',
  'module',
  'import',
  'export',
  'typescript',
  'javascript',
  'python',
  'rust',
  'database',
  'sql',
  'query',
  'schema',
  'migration',
];

const STRUCTURED_OUTPUT_KEYWORDS = [
  'json',
  'xml',
  'yaml',
  'csv',
  'table',
  'structured',
  'array',
  'object',
  'schema',
  'format as',
];

// ---------------------------------------------------------------------------
// AdaptiveRouter
// ---------------------------------------------------------------------------

export class AdaptiveRouter {
  private thresholds: Record<ComplexityTier, number>;
  private modelMap: Record<ModelClass, string>;
  private providerMap: Record<ModelClass, AIProviderType>;
  private forcePremiumAbove: number;
  private debug: boolean;

  /** Historical record: model class → successes / total */
  private classStats = new Map<ModelClass, { success: number; total: number }>();

  constructor(config: AdaptiveRouterConfig = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
    this.modelMap = { ...DEFAULT_MODEL_MAP, ...config.modelMap };
    this.providerMap = { ...DEFAULT_PROVIDER_MAP, ...config.providerMap };
    this.forcePremiumAbove = config.forcePremiumAbove ?? 0.9;
    this.debug = config.debug ?? false;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Analyze the complexity of a conversation and return a full analysis.
   */
  analyze(messages: ChatMessage[], _options?: ChatOptions): ComplexityAnalysis {
    const factors = this.extractFactors(messages);
    const score = this.computeScore(factors);
    const tier = this.scoreToTier(score);
    const suggestedModelClass = this.tierToModelClass(tier, score);

    const analysis: ComplexityAnalysis = { tier, score, factors, suggestedModelClass };

    if (this.debug) {
      console.info(
        `[AdaptiveRouter] score=${score.toFixed(3)} tier=${tier} class=${suggestedModelClass}`,
        factors,
      );
    }

    return analysis;
  }

  /**
   * Convenience: get the recommended model name for a set of messages.
   */
  recommendModel(messages: ChatMessage[], options?: ChatOptions): string {
    // If the caller explicitly requests a model, respect it
    if (options?.model) return options.model;
    const { suggestedModelClass } = this.analyze(messages, options);
    return this.modelMap[suggestedModelClass];
  }

  /**
   * Convenience: get the recommended provider type for a set of messages.
   */
  recommendProvider(messages: ChatMessage[], options?: ChatOptions): AIProviderType {
    const { suggestedModelClass } = this.analyze(messages, options);
    return this.providerMap[suggestedModelClass];
  }

  /**
   * Build ChatOptions enriched with the recommended model.
   */
  adaptOptions(messages: ChatMessage[], options?: ChatOptions): ChatOptions {
    const analysis = this.analyze(messages, options);
    return {
      ...options,
      model: options?.model ?? this.modelMap[analysis.suggestedModelClass],
    };
  }

  /**
   * Report whether a previous request using the given model class succeeded.
   * Used to refine future recommendations via class-level success tracking.
   */
  reportOutcome(modelClass: ModelClass, success: boolean): void {
    const stats = this.classStats.get(modelClass) ?? { success: 0, total: 0 };
    stats.total += 1;
    if (success) stats.success += 1;
    this.classStats.set(modelClass, stats);
  }

  /**
   * Get success rate for a model class (returns 1.0 if no data).
   */
  getSuccessRate(modelClass: ModelClass): number {
    const stats = this.classStats.get(modelClass);
    if (!stats || stats.total === 0) return 1.0;
    return stats.success / stats.total;
  }

  /**
   * Get all class-level stats for dashboard / observability.
   */
  getClassStats(): Map<ModelClass, { success: number; total: number }> {
    return new Map(this.classStats);
  }

  /**
   * Get the estimated cost per 1k tokens for the recommended model.
   */
  estimateCost(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): { model: string; pricing: ModelPricing } {
    const model = this.recommendModel(messages, options);
    return { model, pricing: getModelPricing(model) };
  }

  /**
   * Override the model map at runtime (e.g. for A/B testing).
   */
  setModelMap(partial: Partial<Record<ModelClass, string>>): void {
    Object.assign(this.modelMap, partial);
  }

  /**
   * Override the provider map at runtime.
   */
  setProviderMap(partial: Partial<Record<ModelClass, AIProviderType>>): void {
    Object.assign(this.providerMap, partial);
  }

  // -----------------------------------------------------------------------
  // Private: factor extraction
  // -----------------------------------------------------------------------

  private extractFactors(messages: ChatMessage[]): ComplexityFactors {
    const allText = messages.map((m) => m.content).join('\n');
    const lowerText = allText.toLowerCase();

    const promptLength = allText.length;
    const messageCount = messages.length;
    const hasCodeBlocks = /```[\s\S]*?```/.test(allText);
    const hasSystemPrompt = messages.some((m) => m.role === 'system');
    const avgMessageLength = messageCount > 0 ? promptLength / messageCount : 0;
    const multiTurnDepth = messages.filter((m) => m.role === 'assistant').length;

    const reasoningKeywords = this.countKeywordHits(lowerText, REASONING_KEYWORDS);
    const requiresCreativity = this.countKeywordHits(lowerText, CREATIVITY_KEYWORDS) > 0;
    const requiresCodeGeneration =
      hasCodeBlocks || this.countKeywordHits(lowerText, CODE_KEYWORDS) > 2;
    const hasStructuredOutput = this.countKeywordHits(lowerText, STRUCTURED_OUTPUT_KEYWORDS) > 0;

    // Simple vocabulary diversity heuristic: unique words / total words
    const words = lowerText.split(/\s+/).filter(Boolean);
    const uniqueWords = new Set(words);
    const languageDiversity = words.length > 0 ? uniqueWords.size / words.length : 0;

    return {
      promptLength,
      messageCount,
      hasCodeBlocks,
      hasSystemPrompt,
      reasoningKeywords,
      languageDiversity,
      avgMessageLength,
      hasStructuredOutput,
      multiTurnDepth,
      requiresCreativity,
      requiresCodeGeneration,
    };
  }

  // -----------------------------------------------------------------------
  // Private: score computation
  // -----------------------------------------------------------------------

  private computeScore(f: ComplexityFactors): number {
    let score = 0;

    // 1. Prompt length contribution (0-0.20)
    //    Short prompts (<100 chars) = trivial, very long (>5000) = complex+
    score += this.clamp(f.promptLength / 5000, 0, 1) * 0.2;

    // 2. Message count / multi-turn depth (0-0.10)
    score += this.clamp(f.messageCount / 20, 0, 1) * 0.1;

    // 3. Code blocks present (0.10)
    if (f.hasCodeBlocks) score += 0.1;

    // 4. Reasoning keywords (0-0.15)
    score += this.clamp(f.reasoningKeywords / 5, 0, 1) * 0.15;

    // 5. Language diversity (0-0.10)
    score += f.languageDiversity * 0.1;

    // 6. Code generation request (0.10)
    if (f.requiresCodeGeneration) score += 0.1;

    // 7. Structured output requested (0.05)
    if (f.hasStructuredOutput) score += 0.05;

    // 8. Creativity (0.05)
    if (f.requiresCreativity) score += 0.05;

    // 9. System prompt present (0.05) — suggests structured agent usage
    if (f.hasSystemPrompt) score += 0.05;

    // 10. Multi-turn depth (0-0.05)
    score += this.clamp(f.multiTurnDepth / 10, 0, 1) * 0.05;

    return this.clamp(score, 0, 1);
  }

  // -----------------------------------------------------------------------
  // Private: tier & class mapping
  // -----------------------------------------------------------------------

  private scoreToTier(score: number): ComplexityTier {
    if (score <= this.thresholds.trivial) return 'trivial';
    if (score <= this.thresholds.simple) return 'simple';
    if (score <= this.thresholds.moderate) return 'moderate';
    if (score <= this.thresholds.complex) return 'complex';
    return 'expert';
  }

  private tierToModelClass(tier: ComplexityTier, score: number): ModelClass {
    // Force premium for very high scores regardless of tier
    if (score >= this.forcePremiumAbove) return 'premium';

    switch (tier) {
      case 'trivial':
        return 'fast';
      case 'simple':
        return 'standard';
      case 'moderate':
        return 'capable';
      case 'complex':
        return 'premium';
      case 'expert':
        return 'frontier';
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private countKeywordHits(text: string, keywords: string[]): number {
    let hits = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) hits++;
    }
    return hits;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
