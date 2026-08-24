// Orchestrates multi-tier model selection, dynamic failover fallback chains,
// Thompson-sampling online bandit learning, and adaptive reasoning budget.

import { sleep } from '@ghita/shared';
import { ModelCatalog, type ModelEntry } from './model-catalog.js';
import { ModelRoleRouter, type ModelRole, DEFAULT_ROLE_CHAINS } from './model-roles.js';
import { PersistentBanditRouter, classifyTier, type TurnTier } from './router-v2.js';
import {
  AdaptiveReasoningController,
  type ReasoningBudgetRequest,
} from '../context/reasoning-budget.js';

export interface PipelineSelectOptions {
  candidates?: string[];
  astNodesCount?: number;
  astDepth?: number;
  blastRadius?: number;
}

export interface PipelineModelSelection {
  modelId: string;
  role: ModelRole;
  tier: TurnTier;
  thinkingBudget: number;
  estimatedCost: number;
  fallbackChain: string[];
  modelEntry?: ModelEntry;
}

export interface DynamicFallbackOptions {
  maxRetriesPerModel?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  onFallback?: (failedModel: string, nextModel: string, error: Error) => void;
}

export class MultiEnginePipeline {
  public readonly catalog: ModelCatalog;
  public readonly roleRouter: ModelRoleRouter;
  public readonly banditRouter: PersistentBanditRouter;
  public readonly reasoningController: AdaptiveReasoningController;

  constructor(
    options: {
      catalog?: ModelCatalog;
      roleRouter?: ModelRoleRouter;
      banditDbPath?: string;
      reasoningController?: AdaptiveReasoningController;
    } = {},
  ) {
    this.catalog = options.catalog ?? new ModelCatalog();
    this.roleRouter = options.roleRouter ?? new ModelRoleRouter();
    this.banditRouter = new PersistentBanditRouter(options.banditDbPath ?? ':memory:');
    this.reasoningController = options.reasoningController ?? new AdaptiveReasoningController();
  }

  /**
   * Select the optimal model and calculate reasoning budget for a request.
   */
  selectModel(
    role: ModelRole,
    prompt: string,
    options: PipelineSelectOptions = {},
  ): PipelineModelSelection {
    const tier = classifyTier(prompt);
    const roleResolution = this.roleRouter.resolve(role);
    const chain =
      roleResolution.chain.length > 0 ? roleResolution.chain : (DEFAULT_ROLE_CHAINS[role] ?? []);

    // Filter candidates by available catalog models
    const candidates = options.candidates ?? chain;
    for (const c of candidates) {
      if (!this.banditRouter.getArm(c)) {
        this.banditRouter.registerArm(c, c);
      }
    }

    // Bandit selection among chain candidates
    const selectedArm = this.banditRouter.select({
      bucket: tier === 'complex' ? 'reasoning' : tier === 'moderate' ? 'code' : 'chat',
      candidates,
    });

    const modelId = selectedArm.id;
    const modelEntry = this.catalog.get(modelId);

    // Compute reasoning budget
    const budgetReq: ReasoningBudgetRequest = {
      prompt,
      astNodesCount: options.astNodesCount,
      astDepth: options.astDepth,
      blastRadius: options.blastRadius,
      modelId,
      maxContextTokens: modelEntry?.contextWindow,
      maxOutputTokens: modelEntry?.maxOutputTokens,
    };
    const budgetResult = this.reasoningController.calculateBudget(budgetReq);

    // Reasoning only allocated if model supports thinking
    const thinkingBudget =
      modelEntry && !modelEntry.supportsThinking ? 0 : budgetResult.thinkingBudget;

    const estimatedCost = this.catalog.estimateCost(
      modelId,
      budgetResult.promptTokens,
      modelEntry?.maxOutputTokens ?? 4096,
    );

    const fallbackChain = candidates.filter((c) => c !== modelId);

    return {
      modelId,
      role,
      tier,
      thinkingBudget,
      estimatedCost,
      fallbackChain,
      modelEntry,
    };
  }

  /**
   * Execute an operation with automatic fallback chain and online bandit feedback.
   */
  async executeWithDynamicFallback<T>(
    operation: (modelId: string) => Promise<T>,
    selection: PipelineModelSelection,
    options: DynamicFallbackOptions = {},
  ): Promise<{ result: T; usedModel: string; attempts: number }> {
    const chain = [selection.modelId, ...selection.fallbackChain];
    const maxRetries = options.maxRetriesPerModel ?? 2;
    const baseBackoff = options.baseBackoffMs ?? 200;
    const maxBackoff = options.maxBackoffMs ?? 2000;

    let totalAttempts = 0;
    let lastError: Error = new Error('No models available');

    for (let i = 0; i < chain.length; i++) {
      const currentModel = chain[i];
      if (!currentModel) continue;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        totalAttempts++;
        const startTime = Date.now();

        try {
          const result = await operation(currentModel);
          const latency = Date.now() - startTime;

          // Record reward signal to the bandit
          this.banditRouter.observe(currentModel, 'success', latency);

          return {
            result,
            usedModel: currentModel,
            attempts: totalAttempts,
          };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const isTimeout = lastError.message.toLowerCase().includes('timeout');
          const isRateLimit =
            lastError.message.includes('429') ||
            lastError.message.toLowerCase().includes('rate limit');

          this.banditRouter.observe(
            currentModel,
            isTimeout ? 'timeout' : 'error',
            Date.now() - startTime,
          );

          if (attempt < maxRetries) {
            const jitter = Math.random() * 100;
            const multiplier = isRateLimit ? 2 : 1;
            const delay = Math.min(
              maxBackoff,
              baseBackoff * multiplier * 2 ** (attempt - 1) + jitter,
            );
            await sleep(delay);
          } else if (i < chain.length - 1) {
            const nextModel = chain[i + 1];
            if (nextModel) {
              options.onFallback?.(currentModel, nextModel, lastError);
            }
          }
        }
      }
    }

    throw new Error(
      `All models in fallback chain failed (${chain.join(' -> ')}). Last error: ${lastError.message}`,
    );
  }
}
