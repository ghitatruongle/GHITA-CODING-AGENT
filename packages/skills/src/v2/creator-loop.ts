// Draft → test prompts → eval → optimize description (trigger accuracy),
// mirroring the Anthropic skill-creator eval loop.

export interface SkillDraft {
  id: string;
  name: string;
  description: string;
  /** Sample user prompts used to test the skill trigger. */
  promptSamples: string[];
}

export interface PromptEval {
  prompt: string;
  /** Whether the skill was triggered/used for this prompt. */
  matched: boolean;
  /** Whether the output quality was acceptable (true when unset). */
  qualityOk?: boolean;
}

export interface DraftEvaluation {
  skillId: string;
  total: number;
  matches: number;
  /** Trigger accuracy = matches / total. */
  triggerAccuracy: number;
  qualityOkRatio: number;
  suggestions: string[];
}

export interface EvalConfig {
  /** Prompt-evaluation function; returns quality + match signal. */
  evaluatePrompt: (draft: SkillDraft, prompt: string) => Promise<PromptEval>;
  /** Minimal acceptable trigger accuracy (default 0.6). */
  threshold?: number;
}

/** Run the eval loop for a draft and produce an evaluation. */
export async function evaluateDraft(
  draft: SkillDraft,
  config: EvalConfig,
): Promise<DraftEvaluation> {
  const results: PromptEval[] = [];
  for (const prompt of draft.promptSamples) {
    results.push(await config.evaluatePrompt(draft, prompt));
  }
  const matches = results.filter((r) => r.matched).length;
  const qualityOk = results.filter((r) => r.qualityOk !== false).length;
  const triggerAccuracy = results.length === 0 ? 0 : matches / results.length;
  const qualityOkRatio = results.length === 0 ? 0 : qualityOk / results.length;

  const suggestions: string[] = [];
  if (triggerAccuracy < (config.threshold ?? 0.6)) {
    suggestions.push('add trigger verbs to description ("Use this skill whenever…")');
  }
  if (qualityOkRatio < 0.8) {
    suggestions.push('provide more explicit step-by-step instructions in the body');
  }
  if (draft.description.length < 30) {
    suggestions.push('expand description with "what" and "when to use" (aim ≥ 30 chars)');
  }

  return {
    skillId: draft.id,
    total: results.length,
    matches,
    triggerAccuracy,
    qualityOkRatio,
    suggestions,
  };
}

/** Produce an improved description by applying the eval suggestions. */
export function improveDescription(draft: SkillDraft, evaluation: DraftEvaluation): string {
  let description = draft.description.trim();
  if (evaluation.triggerAccuracy < 0.6 && !/use this skill whenever/i.test(description)) {
    description = `Use this skill whenever ${draft.name} is relevant. Triggers include: ${draft.promptSamples
      .slice(0, 3)
      .join('; ')}. ${description}`;
  }
  return description;
}

/** One full iteration: evaluate → improve → re-evaluate (bounded). */
export async function runCreatorLoop(
  draft: SkillDraft,
  config: EvalConfig,
  maxIterations = 2,
): Promise<{ evaluation: DraftEvaluation; description: string }> {
  let current = draft;
  let evaluation = await evaluateDraft(current, config);
  let iterations = 0;
  while (evaluation.triggerAccuracy < (config.threshold ?? 0.6) && iterations < maxIterations) {
    current = { ...current, description: improveDescription(current, evaluation) };
    evaluation = await evaluateDraft(current, config);
    iterations += 1;
  }
  return { evaluation, description: current.description };
}
