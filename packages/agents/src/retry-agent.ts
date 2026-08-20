// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 2.6: RetryAgent + Reviewer-on-Submit
// ==============================================================================

import { createReActAgent } from './react/agent.js';
import type { CreateReActAgentInput, ReActAgentRunResult } from './react/types.js';
import { HumanMessage } from './messages/message.js';
import type { BaseMessage } from './messages/message.js';

export interface ReviewerVerdict {
  approved: boolean;
  feedback?: string;
}

export type ReviewerFn = (output: string, steps: number) => Promise<ReviewerVerdict>;

export interface RetryAgentConfig {
  maxRetries?: number;
  reviewer?: ReviewerFn;
  retryPrefix?: string;
}

export function createHeuristicReviewer(options?: {
  minLength?: number;
  errorPatterns?: RegExp[];
}): ReviewerFn {
  const minLen = options?.minLength ?? 20;
  const errorPatterns = options?.errorPatterns ?? [
    /\b(error|failed|failure|exception|traceback)\b/i,
    /\b(TODO|FIXME|HACK|XXX)\b/,
    /I (cannot|can't|don't know how to)/i,
  ];

  return async (output: string): Promise<ReviewerVerdict> => {
    const trimmed = output.trim();
    if (trimmed.length < minLen) {
      return {
        approved: false,
        feedback: `Output is too short (${trimmed.length} chars). Please provide a more complete response.`,
      };
    }
    for (const pattern of errorPatterns) {
      if (pattern.test(trimmed)) {
        return {
          approved: false,
          feedback: `Output contains an error indicator matching ${pattern.source}. Please fix the issue and try again.`,
        };
      }
    }
    return { approved: true };
  };
}

export function createLlmReviewer(
  reviewerLlmCall: (messages: BaseMessage[]) => Promise<BaseMessage>,
): ReviewerFn {
  return async (output: string, steps: number): Promise<ReviewerVerdict> => {
    const promptText =
      `Review the following agent output. Respond with ONLY valid JSON: ` +
      `{"approved": true/false, "feedback": "optional improvement suggestions"}. ` +
      `The agent completed in ${steps} steps.\n\n--- OUTPUT ---\n${output}`;
    const prompt = new HumanMessage(promptText);
    try {
      const response = await reviewerLlmCall([prompt]);
      const text = response.getText().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { approved?: boolean; feedback?: string };
        return {
          approved: parsed.approved !== false,
          feedback: typeof parsed.feedback === 'string' ? parsed.feedback : undefined,
        };
      }
    } catch {
      // Reviewer failure = approve by default (fail-open)
    }
    return { approved: true };
  };
}

export async function runWithRetry(
  agentInput: CreateReActAgentInput,
  userMessage: string,
  config?: RetryAgentConfig,
): Promise<ReActAgentRunResult & { retriesUsed: number; reviewHistory: ReviewerVerdict[] }> {
  const maxRetries = config?.maxRetries ?? 1;
  const reviewer = config?.reviewer ?? createHeuristicReviewer();
  const retryPrefix = config?.retryPrefix ?? '[Reviewer feedback] ';

  const reviewHistory: ReviewerVerdict[] = [];
  let retriesUsed = 0;
  let currentMessage = userMessage;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const agent = createReActAgent(agentInput);
    const result = await agent.run(currentMessage);

    const verdict = await reviewer(result.output, result.iterations);
    reviewHistory.push(verdict);

    if (verdict.approved || attempt >= maxRetries) {
      return { ...result, retriesUsed, reviewHistory };
    }

    retriesUsed++;
    currentMessage = `${retryPrefix + (verdict.feedback ?? 'Please improve your response.')}\n\nOriginal request: ${userMessage}`;
  }

  throw new Error('runWithRetry: unexpected loop exit');
}
