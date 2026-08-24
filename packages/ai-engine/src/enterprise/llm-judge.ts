// Use LLM to evaluate content quality, safety, and relevance
// Reference: LiteLLM proxy/guardrails/

import type { AIProvider, ChatMessage } from '../types.js';

// --- Types ---

export type JudgeTask = 'safety' | 'quality' | 'relevance' | 'factuality' | 'custom';

export interface JudgeConfig {
  /** LLM provider to use for judging */
  provider: AIProvider;
  /** Model to use (defaults to provider's default) */
  model?: string;
  /** Temperature for judge responses (low = more deterministic) */
  temperature?: number;
  /** Max retries on failure */
  maxRetries?: number;
}

export interface JudgeResult {
  passed: boolean;
  score: number; // 0-1
  verdict: 'pass' | 'fail' | 'warn';
  reasoning: string;
  task: JudgeTask;
  details?: Record<string, unknown>;
}

export interface JudgeRule {
  ruleId: string;
  name: string;
  task: JudgeTask;
  /** Custom judge prompt (overrides built-in) */
  customPrompt?: string;
  /** Score threshold for passing (0-1) */
  passThreshold: number;
  /** Score threshold for warning (0-1, must be < passThreshold) */
  warnThreshold?: number;
  enabled: boolean;
}

// --- Built-in Judge Prompts ---

const JUDGE_PROMPTS: Record<JudgeTask, string> = {
  safety: `You are a content safety evaluator. Analyze the following content and determine if it is safe.
Rate on a scale of 0.0 to 1.0 where:
- 0.0 = Completely safe, appropriate content
- 0.5 = Borderline, some concerns
- 1.0 = Dangerous, harmful, or explicitly unsafe

Consider: violence, hate speech, self-harm, illegal activities, harmful instructions, harassment.

Respond in JSON format:
{"score": <number>, "verdict": "pass"|"fail"|"warn", "reasoning": "<brief explanation>"}`,

  quality: `You are a content quality evaluator. Analyze the following content and rate its quality.
Rate on a scale of 0.0 to 1.0 where:
- 0.0 = Poor quality, incoherent, unhelpful
- 0.5 = Average quality, somewhat helpful
- 1.0 = Excellent quality, clear, accurate, helpful

Consider: coherence, accuracy, helpfulness, clarity, completeness.

Respond in JSON format:
{"score": <number>, "verdict": "pass"|"fail"|"warn", "reasoning": "<brief explanation>"}`,

  relevance: `You are a relevance evaluator. Analyze whether the response is relevant to the query.
Rate on a scale of 0.0 to 1.0 where:
- 0.0 = Completely irrelevant
- 0.5 = Partially relevant
- 1.0 = Highly relevant and on-topic

Respond in JSON format:
{"score": <number>, "verdict": "pass"|"fail"|"warn", "reasoning": "<brief explanation>"}`,

  factuality: `You are a factuality evaluator. Analyze the following content for factual accuracy.
Rate on a scale of 0.0 to 1.0 where:
- 0.0 = Completely inaccurate, hallucinated
- 0.5 = Some accurate, some inaccurate claims
- 1.0 = Factually accurate and verifiable

Respond in JSON format:
{"score": <number>, "verdict": "pass"|"fail"|"warn", "reasoning": "<brief explanation>"}`,

  custom: `You are a content evaluator. Analyze the following content based on the given criteria.
Rate on a scale of 0.0 to 1.0.

Respond in JSON format:
{"score": <number>, "verdict": "pass"|"fail"|"warn", "reasoning": "<brief explanation>"}`,
};

// --- Default Rules ---

export const DEFAULT_JUDGE_RULES: JudgeRule[] = [
  {
    ruleId: 'safety_check',
    name: 'Safety Check',
    task: 'safety',
    passThreshold: 0.3,
    warnThreshold: 0.6,
    enabled: true,
  },
  {
    ruleId: 'quality_check',
    name: 'Quality Check',
    task: 'quality',
    passThreshold: 0.5,
    warnThreshold: 0.6,
    enabled: true,
  },
];

// --- LLM Judge ---

export class LLMJudge {
  private config: JudgeConfig;
  private rules: JudgeRule[];

  constructor(config: JudgeConfig, rules?: JudgeRule[]) {
    this.config = {
      temperature: 0.1,
      maxRetries: 2,
      ...config,
    };
    this.rules = rules ?? [...DEFAULT_JUDGE_RULES];
  }

  /** Add a judge rule */
  addRule(rule: JudgeRule): void {
    this.rules.push(rule);
  }

  /** Remove a judge rule */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.ruleId === ruleId);
    if (index === -1) return false;
    this.rules.splice(index, 1);
    return true;
  }

  /** Evaluate content against a specific task */
  async evaluate(
    content: string,
    task: JudgeTask,
    options?: {
      query?: string; // Original query for relevance checking
      context?: string; // Additional context
      customCriteria?: string; // For custom task
    },
  ): Promise<JudgeResult> {
    const rule = this.rules.find((r) => r.task === task && r.enabled);
    const passThreshold = rule?.passThreshold ?? 0.5;
    const warnThreshold = rule?.warnThreshold;

    const prompt = this.buildPrompt(content, task, options);

    let lastError: Error | undefined;
    const maxRetries = this.config.maxRetries ?? 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const messages: ChatMessage[] = [
          { role: 'system', content: prompt },
          { role: 'user', content },
        ];

        const response = await this.config.provider.chat(messages, {
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens: 500,
        });

        const parsed = this.parseResponse(response.content);

        const passed = parsed.score <= passThreshold;
        const isWarn = !passed && warnThreshold !== undefined && parsed.score <= warnThreshold;

        return {
          passed,
          score: parsed.score,
          verdict: passed ? 'pass' : isWarn ? 'warn' : 'fail',
          reasoning: parsed.reasoning,
          task,
          details: parsed.details,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    // All retries failed — return safe default
    return {
      passed: false,
      score: 0,
      verdict: 'warn',
      reasoning: `Judge evaluation failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
      task,
    };
  }

  /** Evaluate content against all enabled rules */
  async evaluateAll(
    content: string,
    options?: {
      query?: string;
      context?: string;
      customCriteria?: string;
    },
  ): Promise<JudgeResult[]> {
    const enabledRules = this.rules.filter((r) => r.enabled);
    const results: JudgeResult[] = [];

    for (const rule of enabledRules) {
      const result = await this.evaluate(content, rule.task, options);
      results.push(result);
    }

    return results;
  }

  /** Evaluate and return aggregate result */
  async evaluateAggregate(
    content: string,
    options?: {
      query?: string;
      context?: string;
      customCriteria?: string;
      /** Fail if ANY rule fails (default: true) */
      failOnAny?: boolean;
    },
  ): Promise<JudgeResult & { allResults: JudgeResult[] }> {
    const allResults = await this.evaluateAll(content, options);
    const failOnAny = options?.failOnAny ?? true;

    const anyFailed = allResults.some((r) => r.verdict === 'fail');
    const anyWarn = allResults.some((r) => r.verdict === 'warn');

    const avgScore = allResults.reduce((sum, r) => sum + r.score, 0) / allResults.length;

    let verdict: 'pass' | 'fail' | 'warn';
    if (failOnAny && anyFailed) {
      verdict = 'fail';
    } else if (anyWarn) {
      verdict = 'warn';
    } else {
      verdict = 'pass';
    }

    return {
      passed: verdict !== 'fail',
      score: avgScore,
      verdict,
      reasoning: allResults.map((r) => `[${r.task}] ${r.reasoning}`).join('\n'),
      task: 'custom',
      allResults,
    };
  }

  /** Build the judge prompt */
  private buildPrompt(
    _content: string,
    task: JudgeTask,
    options?: {
      query?: string;
      context?: string;
      customCriteria?: string;
    },
  ): string {
    const rule = this.rules.find((r) => r.task === task);

    let prompt = rule?.customPrompt ?? JUDGE_PROMPTS[task];

    if (options?.query) {
      prompt += `\n\nOriginal Query:\n${options.query}`;
    }

    if (options?.context) {
      prompt += `\n\nContext:\n${options.context}`;
    }

    if (options?.customCriteria && task === 'custom') {
      prompt += `\n\nEvaluation Criteria:\n${options.customCriteria}`;
    }

    return prompt;
  }

  /** Parse LLM response */
  private parseResponse(response: string): {
    score: number;
    reasoning: string;
    details?: Record<string, unknown>;
  } {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const rawScore = Number(parsed.score);
        const score = Number.isFinite(rawScore) ? rawScore : 0.5;
        return {
          score: Math.max(0, Math.min(1, score)),
          reasoning: String(parsed.reasoning ?? 'No reasoning provided'),
          details: parsed,
        };
      }
    } catch {
      // Fall through to text parsing
    }

    // Fallback: try to extract score from text
    const scoreMatch = response.match(/score[:\s]*(\d+\.?\d*)/i);
    const score = scoreMatch ? Math.max(0, Math.min(1, Number(scoreMatch[1]))) : 0.5;

    return {
      score,
      reasoning: response.substring(0, 500),
    };
  }

  /** Get all rules */
  getRules(): JudgeRule[] {
    return [...this.rules];
  }

  /** Update config */
  updateConfig(updates: Partial<JudgeConfig>): void {
    Object.assign(this.config, updates);
  }
}
