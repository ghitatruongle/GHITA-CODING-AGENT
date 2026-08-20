// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 7.3: Skill Description Optimizer
// ------------------------------------------------------------------------------
// Quantitative tooling for skill descriptions: optimize triggering accuracy,
// variance benchmark reports, and eval-viewer data generation.
//
// Pattern: anthropics skill-creator description-optimizer, variance benchmark.
// ==============================================================================

export interface DescriptionCandidate {
  original: string;
  optimized: string;
  score: number;
  improvements: string[];
}

export interface BenchmarkResult {
  skillId: string;
  description: string;
  triggerAccuracy: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  varianceScore: number;
  sampleSize: number;
}

/** Heuristic quality signals for a skill description. */
const QUALITY_SIGNALS = [
  { pattern: /\b(when|if|after|before|during)\b/i, label: 'trigger-context', weight: 0.15 },
  { pattern: /\b(use|run|execute|apply|invoke)\b/i, label: 'action-verb', weight: 0.1 },
  { pattern: /\b(for|to)\s+\w+ing\b/i, label: 'purpose-clause', weight: 0.12 },
  {
    pattern: /\b(file|code|test|deploy|build|search|read|write)\b/i,
    label: 'domain-keyword',
    weight: 0.08,
  },
  { pattern: /^[A-Z]/, label: 'starts-capitalized', weight: 0.05 },
  { pattern: /\.$/, label: 'ends-period', weight: 0.03 },
];

const ANTI_PATTERNS = [
  {
    pattern: /\b(this|that|it|they)\b(?!\s+(is|are|was|were|can|will|should))/i,
    label: 'vague-pronoun',
    penalty: 0.1,
  },
  { pattern: /\b(etc|and so on|stuff|things)\b/i, label: 'vague-filler', penalty: 0.15 },
  { pattern: /\b(maybe|probably|might|could)\b/i, label: 'hedging', penalty: 0.08 },
  { pattern: /^.{0,20}$/, label: 'too-short', penalty: 0.2 },
];

/**
 * Score a skill description for triggering quality (0-1).
 */
export function scoreDescription(description: string): {
  score: number;
  signals: string[];
  penalties: string[];
} {
  let score = 0.3; // baseline
  const signals: string[] = [];
  const penalties: string[] = [];

  for (const sig of QUALITY_SIGNALS) {
    if (sig.pattern.test(description)) {
      score += sig.weight;
      signals.push(sig.label);
    }
  }

  for (const ap of ANTI_PATTERNS) {
    if (ap.pattern.test(description)) {
      score -= ap.penalty;
      penalties.push(ap.label);
    }
  }

  // Length bonus (sweet spot: 40-120 chars)
  const len = description.length;
  if (len >= 40 && len <= 120) {
    score += 0.1;
    signals.push('good-length');
  } else if (len > 120) {
    score -= 0.05;
    penalties.push('too-long');
  }

  return { score: Math.max(0, Math.min(1, score)), signals, penalties };
}

/**
 * Suggest improvements for a skill description.
 */
export function suggestImprovements(description: string): string[] {
  const { penalties } = scoreDescription(description);
  const suggestions: string[] = [];

  if (penalties.includes('too-short')) {
    suggestions.push('Expand description to at least 40 characters with specific trigger context.');
  }
  if (penalties.includes('vague-pronoun')) {
    suggestions.push('Replace vague pronouns (this/that/it) with specific nouns.');
  }
  if (penalties.includes('vague-filler')) {
    suggestions.push('Remove filler words (etc, stuff, things) — be specific.');
  }
  if (penalties.includes('hedging')) {
    suggestions.push('Remove hedging language (maybe, probably) — be direct.');
  }
  if (penalties.includes('too-long')) {
    suggestions.push('Shorten to under 120 characters — focus on when/how to trigger.');
  }

  const { signals } = scoreDescription(description);
  if (!signals.includes('trigger-context')) {
    suggestions.push('Add trigger context: when/if/after/before this skill should activate.');
  }
  if (!signals.includes('action-verb')) {
    suggestions.push('Start with an action verb: use/run/execute/apply.');
  }

  return suggestions;
}

/**
 * Run a mock benchmark against a set of test prompts.
 * In production, this would use actual LLM routing decisions.
 */
export function runDescriptionBenchmark(
  skillId: string,
  description: string,
  testPrompts: Array<{ prompt: string; shouldTrigger: boolean }>,
): BenchmarkResult {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;

  const descLower = description.toLowerCase();
  const descWords = new Set(descLower.split(/\s+/).filter((w) => w.length > 3));

  for (const tc of testPrompts) {
    const promptLower = tc.prompt.toLowerCase();
    const promptWords = promptLower.split(/\s+/).filter((w) => w.length > 3);
    const overlap = promptWords.filter((w) => descWords.has(w)).length;
    const triggered =
      overlap >= 2 ||
      descLower.split(/\s+/).some((dw) => dw.length > 4 && promptLower.includes(dw));

    if (triggered && tc.shouldTrigger) truePositives++;
    else if (triggered && !tc.shouldTrigger) falsePositives++;
    else if (!triggered && tc.shouldTrigger) falseNegatives++;
    else trueNegatives++;
  }

  const total = testPrompts.length;
  const triggerAccuracy = total > 0 ? (truePositives + trueNegatives) / total : 0;
  const fpRate = total > 0 ? falsePositives / total : 0;
  const fnRate = total > 0 ? falseNegatives / total : 0;

  // Variance: how consistent is the triggering across similar prompts
  const varianceScore = 1 - Math.abs(fpRate - fnRate);

  return {
    skillId,
    description,
    triggerAccuracy,
    falsePositiveRate: fpRate,
    falseNegativeRate: fnRate,
    varianceScore,
    sampleSize: total,
  };
}
