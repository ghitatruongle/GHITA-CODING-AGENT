// Task-aware provider & model recommendation with historical affinity tracking

import type { AIProviderType } from '@ghita/shared';
import type { ChatMessage, ChatOptions, AIProvider } from '../types.js';
import { getModelPricing, type ModelPricing } from '../cost/tracker.js';

// Task Type Detection

/** Detected task type from prompt analysis */
export type TaskType =
  | 'code-generation'
  | 'code-review'
  | 'debugging'
  | 'explanation'
  | 'refactoring'
  | 'creative-writing'
  | 'summarization'
  | 'translation'
  | 'data-extraction'
  | 'question-answering'
  | 'planning'
  | 'general';

// Recommendation Types

/** A single recommendation entry with score breakdown */
export interface ProviderRecommendation {
  provider: AIProviderType;
  model: string;
  score: number; // 0-1 composite recommendation score
  reasoning: string[]; // human-readable reasons for this recommendation
  estimatedCost: ModelPricing;
  taskAffinity: number; // 0-1 historical affinity for this task type
  providerHealth: number; // 0-1 provider availability score
}

/** Result of a recommendation query */
export interface RecommendationResult {
  taskType: TaskType;
  recommendations: ProviderRecommendation[];
  best: ProviderRecommendation | null;
  analyzedAt: number;
}

// Configuration

export interface RecommendationConfig {
  /** Known provider→models mapping (provider → model list) */
  providerModels?: Partial<Record<AIProviderType, string[]>>;
  /** Cost weight in composite score (0-1, default 0.3) */
  costWeight?: number;
  /** Quality/affinity weight in composite score (0-1, default 0.5) */
  qualityWeight?: number;
  /** Health weight in composite score (0-1, default 0.2) */
  healthWeight?: number;
  /** Max cost per request constraint (USD, skip models exceeding this) */
  maxCostPerRequest?: number;
  /** Preferred providers (boosted in scoring) */
  preferredProviders?: AIProviderType[];
  /** Override task→model affinity (taskType → model → score 0-1) */
  taskAffinityOverrides?: Partial<Record<TaskType, Record<string, number>>>;
}

// Default provider → models mapping

const DEFAULT_PROVIDER_MODELS: Partial<Record<AIProviderType, string[]>> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro'],
  ollama: ['llama3', 'qwen2.5-coder:7b', 'deepseek-coder-v2'],
  deepseek: ['deepseek-chat', 'deepseek-coder'],
};

// Default task→model affinity (hand-tuned starting values, updated via feedback)

const DEFAULT_TASK_AFFINITY: Record<TaskType, Record<string, number>> = {
  'code-generation': {
    'claude-sonnet-4-20250514': 0.95,
    'claude-opus-4-20250514': 0.97,
    'gpt-4o': 0.9,
    'gpt-4o-mini': 0.7,
    'deepseek-coder': 0.82,
    'qwen2.5-coder:7b': 0.65,
    'gemini-2.5-pro': 0.85,
  },
  'code-review': {
    'claude-sonnet-4-20250514': 0.93,
    'claude-opus-4-20250514': 0.96,
    'gpt-4o': 0.88,
    'gpt-4o-mini': 0.6,
    'gemini-2.5-pro': 0.82,
  },
  debugging: {
    'claude-sonnet-4-20250514': 0.92,
    'gpt-4o': 0.88,
    'deepseek-coder': 0.8,
    'claude-opus-4-20250514': 0.95,
    'gemini-2.5-pro': 0.8,
  },
  explanation: {
    'gpt-4o': 0.9,
    'gpt-4o-mini': 0.82,
    'claude-sonnet-4-20250514': 0.88,
    'gemini-2.5-flash': 0.8,
    llama3: 0.6,
  },
  refactoring: {
    'claude-sonnet-4-20250514': 0.94,
    'claude-opus-4-20250514': 0.96,
    'gpt-4o': 0.87,
    'deepseek-coder': 0.78,
  },
  'creative-writing': {
    'claude-opus-4-20250514': 0.95,
    'gpt-4o': 0.9,
    'claude-sonnet-4-20250514': 0.88,
    'gemini-2.5-pro': 0.82,
  },
  summarization: {
    'gpt-4o-mini': 0.88,
    'gemini-2.5-flash': 0.85,
    'gpt-4o': 0.82,
    'claude-3-5-haiku': 0.83,
  },
  translation: {
    'gpt-4o': 0.9,
    'gpt-4o-mini': 0.8,
    'gemini-2.5-flash': 0.82,
    'claude-sonnet-4-20250514': 0.85,
  },
  'data-extraction': {
    'gpt-4o': 0.88,
    'gpt-4o-mini': 0.78,
    'gemini-2.5-pro': 0.85,
    'claude-sonnet-4-20250514': 0.86,
  },
  'question-answering': {
    'gpt-4o': 0.88,
    'gpt-4o-mini': 0.75,
    'gemini-2.5-flash': 0.8,
    'claude-sonnet-4-20250514': 0.9,
  },
  planning: {
    'claude-opus-4-20250514': 0.96,
    'claude-sonnet-4-20250514': 0.9,
    'gpt-4o': 0.87,
    'o3-mini': 0.85,
    'gemini-2.5-pro': 0.83,
  },
  general: {
    'gpt-4o': 0.85,
    'gpt-4o-mini': 0.78,
    'claude-sonnet-4-20250514': 0.85,
    'gemini-2.5-flash': 0.78,
  },
};

// Keyword sets for task type detection

const TASK_KEYWORDS: Record<Exclude<TaskType, 'general'>, string[]> = {
  'code-generation': [
    'write code',
    'implement',
    'create function',
    'build',
    'generate code',
    'write a class',
    'create module',
    'develop',
    'program',
  ],
  'code-review': [
    'review',
    'code review',
    'check code',
    'audit',
    'best practices',
    'lint',
    'code quality',
  ],
  debugging: [
    'debug',
    'fix bug',
    'error',
    'traceback',
    'stack trace',
    'not working',
    'crash',
    'exception',
    'broken',
  ],
  explanation: [
    'explain',
    'what does',
    'how does',
    'describe',
    'walk me through',
    'understand',
    'break down',
  ],
  refactoring: [
    'refactor',
    'improve code',
    'clean up',
    'restructure',
    'simplify',
    'optimize code',
    'rewrite',
  ],
  'creative-writing': [
    'write a story',
    'blog',
    'essay',
    'creative',
    'poem',
    'narrative',
    'fiction',
    'marketing copy',
  ],
  summarization: [
    'summarize',
    'summary',
    'tldr',
    'key points',
    'brief overview',
    'condense',
    'shorten',
  ],
  translation: [
    'translate',
    'translation',
    'in spanish',
    'in french',
    'in vietnamese',
    'in japanese',
    'in chinese',
    'localize',
  ],
  'data-extraction': [
    'extract',
    'parse',
    'pull data',
    'scrape',
    'find all',
    'list all',
    'get all',
    'json',
    'csv',
  ],
  'question-answering': ['what is', 'how to', 'why', 'when', 'where', 'who', 'can you tell me'],
  planning: [
    'plan',
    'architecture',
    'design',
    'roadmap',
    'strategy',
    'step by step',
    'approach',
    'break into tasks',
  ],
};

// ProviderRecommendationSystem

export class ProviderRecommendationSystem {
  private providerModels: Partial<Record<AIProviderType, string[]>>;
  private costWeight: number;
  private qualityWeight: number;
  private healthWeight: number;
  private maxCostPerRequest: number;
  private preferredProviders: Set<AIProviderType>;
  private taskAffinity: Record<TaskType, Record<string, number>>;

  /** Provider health scores (0-1), updated via reportHealth() */
  private providerHealth = new Map<AIProviderType, number>();

  /** Runtime task affinity adjustments from feedback */
  private feedbackAffinity = new Map<string, { success: number; total: number }>();

  constructor(config: RecommendationConfig = {}) {
    this.providerModels = { ...DEFAULT_PROVIDER_MODELS };
    if (config.providerModels) {
      for (const [k, v] of Object.entries(config.providerModels)) {
        const key = k as AIProviderType;
        this.providerModels[key] = [...(this.providerModels[key] ?? []), ...(v ?? [])];
      }
    }

    this.costWeight = config.costWeight ?? 0.3;
    this.qualityWeight = config.qualityWeight ?? 0.5;
    this.healthWeight = config.healthWeight ?? 0.2;
    this.maxCostPerRequest = config.maxCostPerRequest ?? Infinity;
    this.preferredProviders = new Set(config.preferredProviders ?? []);

    // Merge task affinity overrides
    this.taskAffinity = JSON.parse(JSON.stringify(DEFAULT_TASK_AFFINITY));
    if (config.taskAffinityOverrides) {
      for (const [task, models] of Object.entries(config.taskAffinityOverrides)) {
        const t = task as TaskType;
        if (!this.taskAffinity[t]) this.taskAffinity[t] = {};
        Object.assign(this.taskAffinity[t], models);
      }
    }
  }

  // Public API
  
  /**
   * Detect the task type from a conversation.
   */
  detectTaskType(messages: ChatMessage[]): TaskType {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) return 'general';

    const text = userMessages
      .map((m) => m.content)
      .join(' ')
      .toLowerCase();

    const scores = new Map<TaskType, number>();
    for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
      let hits = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) hits++;
      }
      if (hits > 0) scores.set(taskType as TaskType, hits);
    }

    if (scores.size === 0) return 'general';

    // Also check for code blocks which strongly indicate code tasks
    const hasCodeBlocks = /```[\s\S]*?```/.test(text);
    if (hasCodeBlocks) {
      const codeScore = (scores.get('code-generation') ?? 0) + 2;
      scores.set('code-generation', codeScore);
    }

    // Return the highest scoring task type
    let best: TaskType = 'general';
    let bestScore = 0;
    for (const [task, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        best = task;
      }
    }
    return best;
  }

  /**
   * Get ranked provider/model recommendations for a conversation.
   */
  recommend(
    messages: ChatMessage[],
    _options?: ChatOptions,
    availableProviders?: AIProvider[],
  ): RecommendationResult {
    const taskType = this.detectTaskType(messages);
    const available = new Set<AIProviderType>();

    // If availableProviders given, restrict to those
    if (availableProviders && availableProviders.length > 0) {
      for (const p of availableProviders) available.add(p.type);
    } else {
      // Otherwise consider all configured providers
      for (const k of Object.keys(this.providerModels)) {
        available.add(k as AIProviderType);
      }
    }

    const recommendations: ProviderRecommendation[] = [];

    for (const providerType of available) {
      const models = this.providerModels[providerType] ?? [];
      for (const model of models) {
        const pricing = getModelPricing(model);
        const estimatedCostPer1k = pricing.inputCostPer1k + pricing.outputCostPer1k;

        // Skip if exceeds cost constraint
        if (estimatedCostPer1k * 4 > this.maxCostPerRequest) continue; // assume ~4k tokens avg

        const taskAff = this.getTaskAffinity(taskType, model);
        const health = this.getProviderHealth(providerType);
        const costScore = this.scoreCost(pricing);
        const preferredBoost = this.preferredProviders.has(providerType) ? 0.05 : 0;

        const score = this.clamp(
          taskAff * this.qualityWeight +
            costScore * this.costWeight +
            health * this.healthWeight +
            preferredBoost,
          0,
          1,
        );

        const reasoning: string[] = [];
        if (taskAff >= 0.85) reasoning.push(`Strong affinity for ${taskType}`);
        if (costScore >= 0.8) reasoning.push('Cost-efficient');
        if (health >= 0.9) reasoning.push('High availability');
        if (this.preferredProviders.has(providerType)) reasoning.push('Preferred provider');

        recommendations.push({
          provider: providerType,
          model,
          score,
          reasoning,
          estimatedCost: pricing,
          taskAffinity: taskAff,
          providerHealth: health,
        });
      }
    }

    // Sort by score descending
    recommendations.sort((a, b) => b.score - a.score);

    return {
      taskType,
      recommendations,
      best: recommendations[0] ?? null,
      analyzedAt: Date.now(),
    };
  }

  /**
   * Convenience: get the single best model recommendation.
   */
  recommendBest(
    messages: ChatMessage[],
    options?: ChatOptions,
    providers?: AIProvider[],
  ): { provider: AIProviderType; model: string } | null {
    const result = this.recommend(messages, options, providers);
    if (!result.best) return null;
    return { provider: result.best.provider, model: result.best.model };
  }

  /**
   * Report a provider's health status (from health check or failure).
   * @param health 0-1 score (1 = fully healthy)
   */
  reportHealth(provider: AIProviderType, health: number): void {
    this.providerHealth.set(provider, this.clamp(health, 0, 1));
  }

  /**
   * Report feedback on a model's performance for a task type.
   * Adjusts task affinity over time.
   */
  reportFeedback(taskType: TaskType, model: string, success: boolean): void {
    const key = `${taskType}:${model}`;
    const stats = this.feedbackAffinity.get(key) ?? { success: 0, total: 0 };
    stats.total += 1;
    if (success) stats.success += 1;
    this.feedbackAffinity.set(key, stats);

    // Update task affinity with exponential moving average
    const feedbackScore = stats.success / stats.total;
    if (!this.taskAffinity[taskType]) this.taskAffinity[taskType] = {};
    const current = this.taskAffinity[taskType][model] ?? 0.5;
    const alpha = 0.2; // EMA smoothing factor
    this.taskAffinity[taskType][model] = current * (1 - alpha) + feedbackScore * alpha;
  }

  /**
   * Get current task affinity score for a model.
   */
  getTaskAffinity(taskType: TaskType, model: string): number {
    // Check feedback-adjusted affinity first
    const key = `${taskType}:${model}`;
    const feedback = this.feedbackAffinity.get(key);
    if (feedback && feedback.total >= 3) {
      return feedback.success / feedback.total;
    }

    // Fall back to static affinity table (partial model name match)
    const affinities = this.taskAffinity[taskType];
    if (!affinities) return 0.5;

    const lower = model.toLowerCase();
    for (const [pattern, score] of Object.entries(affinities)) {
      if (lower.includes(pattern.toLowerCase()) || pattern.toLowerCase().includes(lower)) {
        return score;
      }
    }
    return 0.5; // Default unknown affinity
  }

  /**
   * Get current provider health (returns 1.0 if unknown).
   */
  getProviderHealth(provider: AIProviderType): number {
    return this.providerHealth.get(provider) ?? 1.0;
  }

  /**
   * Register additional models for a provider at runtime.
   */
  registerModels(provider: AIProviderType, models: string[]): void {
    const existing = this.providerModels[provider] ?? [];
    const merged = new Set([...existing, ...models]);
    this.providerModels[provider] = Array.from(merged);
  }

  /**
   * Get the full task affinity table (for dashboard / debugging).
   */
  getAffinityTable(): Record<TaskType, Record<string, number>> {
    return JSON.parse(JSON.stringify(this.taskAffinity));
  }

  // Private helpers
  
  /**
   * Score cost efficiency: cheaper models get higher scores.
   * Normalized against a max reference cost.
   */
  private scoreCost(pricing: ModelPricing): number {
    const totalCostPer1k = pricing.inputCostPer1k + pricing.outputCostPer1k;
    // Reference: gpt-4-turbo total ≈ 0.04/1k tokens
    const reference = 0.04;
    const score = 1 - this.clamp(totalCostPer1k / reference, 0, 1);
    return score;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
