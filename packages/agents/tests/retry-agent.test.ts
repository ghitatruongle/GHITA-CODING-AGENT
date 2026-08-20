import { describe, expect, it } from 'vitest';
import { runWithRetry, createHeuristicReviewer, createLlmReviewer } from '../src/retry-agent.js';
import { AIMessage, HumanMessage } from '../src/messages/message.js';
import type { BaseMessage } from '../src/messages/message.js';

describe('createHeuristicReviewer', () => {
  it('approves good output', async () => {
    const reviewer = createHeuristicReviewer();
    const verdict = await reviewer(
      'This is a complete and well-formed response with sufficient detail.',
      3,
    );
    expect(verdict.approved).toBe(true);
  });

  it('rejects output that is too short', async () => {
    const reviewer = createHeuristicReviewer({ minLength: 50 });
    const verdict = await reviewer('Short.', 1);
    expect(verdict.approved).toBe(false);
    expect(verdict.feedback).toContain('too short');
  });

  it('rejects output containing error indicators', async () => {
    const reviewer = createHeuristicReviewer();
    const verdict = await reviewer(
      'An error occurred while processing your request. Failed to complete.',
      2,
    );
    expect(verdict.approved).toBe(false);
    expect(verdict.feedback).toContain('error indicator');
  });

  it('rejects output containing TODO markers', async () => {
    const reviewer = createHeuristicReviewer();
    const verdict = await reviewer('Here is the implementation with a TODO for edge cases.', 2);
    expect(verdict.approved).toBe(false);
  });
});

describe('createLlmReviewer', () => {
  it('parses JSON verdict from LLM response', async () => {
    const llm = async (): Promise<BaseMessage> =>
      new AIMessage('{"approved": false, "feedback": "Add more examples."}');
    const reviewer = createLlmReviewer(llm);
    const verdict = await reviewer('some output', 3);
    expect(verdict.approved).toBe(false);
    expect(verdict.feedback).toBe('Add more examples.');
  });

  it('fails open when LLM returns invalid JSON', async () => {
    const llm = async (): Promise<BaseMessage> => new AIMessage('This looks good to me!');
    const reviewer = createLlmReviewer(llm);
    const verdict = await reviewer('some output', 3);
    expect(verdict.approved).toBe(true);
  });

  it('fails open when LLM throws', async () => {
    const llm = async (): Promise<BaseMessage> => {
      throw new Error('timeout');
    };
    const reviewer = createLlmReviewer(llm);
    const verdict = await reviewer('some output', 3);
    expect(verdict.approved).toBe(true);
  });
});

describe('runWithRetry', () => {
  it('returns immediately when reviewer approves on first attempt', async () => {
    let callCount = 0;
    const result = await runWithRetry(
      {
        config: { name: 'test', maxIterations: 3 },
        llmCall: async () => {
          callCount++;
          return new AIMessage('Good complete answer with enough detail here.');
        },
      },
      'do something',
      { reviewer: async () => ({ approved: true }) },
    );
    expect(callCount).toBe(1);
    expect(result.retriesUsed).toBe(0);
    expect(result.reviewHistory).toHaveLength(1);
    expect(result.reviewHistory[0].approved).toBe(true);
  });

  it('retries once when reviewer rejects first attempt', async () => {
    let callCount = 0;
    const result = await runWithRetry(
      {
        config: { name: 'test', maxIterations: 3 },
        llmCall: async (messages: BaseMessage[]) => {
          callCount++;
          // On retry, the message contains reviewer feedback
          const hasFeedback = messages.some((m) => m.getText().includes('[Reviewer feedback]'));
          if (hasFeedback) {
            return new AIMessage(
              'Improved answer addressing all reviewer concerns with full detail.',
            );
          }
          return new AIMessage('err'); // Short → heuristic reviewer rejects
        },
      },
      'fix bug',
      { maxRetries: 1 },
    );
    expect(callCount).toBe(2);
    expect(result.retriesUsed).toBe(1);
    expect(result.reviewHistory).toHaveLength(2);
    expect(result.reviewHistory[0].approved).toBe(false);
    expect(result.output).toContain('Improved answer');
  });

  it('stops at maxRetries even if reviewer keeps rejecting', async () => {
    let callCount = 0;
    const result = await runWithRetry(
      {
        config: { name: 'test', maxIterations: 3 },
        llmCall: async () => {
          callCount++;
          return new AIMessage('x');
        },
      },
      'do something',
      {
        maxRetries: 2,
        reviewer: async () => ({ approved: false, feedback: 'Not good enough.' }),
      },
    );
    // Initial + 2 retries = 3 calls
    expect(callCount).toBe(3);
    expect(result.retriesUsed).toBe(2);
    expect(result.reviewHistory).toHaveLength(3);
  });

  it('uses custom retry prefix in the retry message', async () => {
    const allUserMessages: string[] = [];
    let callCount = 0;
    const result = await runWithRetry(
      {
        config: { name: 'test', maxIterations: 3 },
        llmCall: async (messages: BaseMessage[]) => {
          // Capture the user message (first HumanMessage) from each run
          const userMsg = messages.find((m) => m instanceof HumanMessage);
          if (userMsg) allUserMessages.push(userMsg.getText());
          callCount++;
          return new AIMessage('Better answer with sufficient length and no errors.');
        },
      },
      'original task',
      {
        maxRetries: 1,
        retryPrefix: '[CUSTOM] ',
        reviewer: async () => {
          // Reject the first attempt, approve the second
          return callCount <= 1 ? { approved: false, feedback: 'Try harder.' } : { approved: true };
        },
      },
    );
    expect(result.retriesUsed).toBe(1);
    expect(allUserMessages.length).toBeGreaterThanOrEqual(2);
    expect(allUserMessages[1]).toContain('[CUSTOM]');
    expect(allUserMessages[1]).toContain('Try harder.');
  });
});
