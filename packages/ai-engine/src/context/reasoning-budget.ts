// ==============================================================================
// GHITA CODING AGENT — Adaptive Reasoning Budget Controller (v1.1.5-beta2 Track 4)
// ==============================================================================
// Dynamically computes thinking/reasoning token budget based on:
// 1. Prompt complexity tier (simple/moderate/complex)
// 2. Code AST structure (node count & tree depth)
// 3. Blast radius / dependency impact count
// 4. TokenCounter context headroom constraint
// ==============================================================================

import { estimateTokens } from '../utils/token-counter.js';
import { classifyTier, type TurnTier } from '../routing/router-v2.js';

export interface ReasoningBudgetRequest {
  prompt: string;
  history?: Array<{ role: string; content: string }>;
  astNodesCount?: number;
  astDepth?: number;
  blastRadius?: number;
  modelId?: string;
  maxContextTokens?: number;
  maxOutputTokens?: number;
}

export interface ReasoningBudgetResult {
  thinkingBudget: number;
  tier: TurnTier;
  promptTokens: number;
  remainingContextTokens: number;
  explanation: string;
}

const TIER_BASE_THINKING: Record<TurnTier, number> = {
  simple: 0,
  moderate: 2048,
  complex: 8192,
};

export class AdaptiveReasoningController {
  private readonly defaultMaxContext: number;
  private readonly defaultMaxOutput: number;

  constructor(options: { defaultMaxContext?: number; defaultMaxOutput?: number } = {}) {
    this.defaultMaxContext = options.defaultMaxContext ?? 128_000;
    this.defaultMaxOutput = options.defaultMaxOutput ?? 4096;
  }

  /**
   * Calculate the optimal thinking token budget for an incoming turn.
   */
  calculateBudget(request: ReasoningBudgetRequest): ReasoningBudgetResult {
    const tier = classifyTier(request.prompt);
    const fullText = [...(request.history?.map((h) => h.content) ?? []), request.prompt].join('\n');

    const promptTokens = estimateTokens(fullText, request.modelId);
    const maxContext = request.maxContextTokens ?? this.defaultMaxContext;
    const reservedOutput = request.maxOutputTokens ?? this.defaultMaxOutput;

    // Headroom safety constraint
    const availableHeadroom = Math.max(0, maxContext - promptTokens - reservedOutput);

    if (tier === 'simple') {
      return {
        thinkingBudget: 0,
        tier: 'simple',
        promptTokens,
        remainingContextTokens: availableHeadroom,
        explanation:
          'Simple turn: reasoning disabled (0 thinking tokens) to optimize latency & cost.',
      };
    }

    const baseBudget = TIER_BASE_THINKING[tier];

    // Structural complexity multipliers
    const astNodes = request.astNodesCount ?? 0;
    const astDepth = request.astDepth ?? 0;
    const blastRadius = request.blastRadius ?? 0;

    const astMultiplier = 1.0 + Math.min(0.5, astNodes / 200) + Math.min(0.5, astDepth / 10);
    const blastMultiplier = 1.0 + Math.min(1.0, blastRadius / 20);

    let rawBudget = Math.round(baseBudget * astMultiplier * blastMultiplier);

    // Clamp between tier base and 32,768 tokens, bounded by headroom
    rawBudget = Math.min(rawBudget, 32_768);
    const finalBudget = Math.min(rawBudget, Math.floor(availableHeadroom * 0.5));

    return {
      thinkingBudget: finalBudget,
      tier,
      promptTokens,
      remainingContextTokens: availableHeadroom - finalBudget,
      explanation: `Allocated ${finalBudget} thinking tokens for ${tier} complexity (AST multiplier: ${astMultiplier.toFixed(2)}, blast multiplier: ${blastMultiplier.toFixed(2)}).`,
    };
  }
}
