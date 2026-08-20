import { describe, expect, it } from 'vitest';
import {
  classifyTurnComplexity,
  matchesAgentPattern,
  selectAgentForTier,
} from '../src/routing/smart-router.js';
import type { AgentRoutingEntry } from '../src/routing/smart-router.js';
import { createReActAgent } from '../src/react/agent.js';
import { AIMessage } from '../src/messages/message.js';

describe('classifyTurnComplexity', () => {
  it('classifies short greetings as simple', () => {
    expect(classifyTurnComplexity('hello')).toBe('simple');
    expect(classifyTurnComplexity('thanks')).toBe('simple');
    expect(classifyTurnComplexity('ok')).toBe('simple');
  });

  it('classifies long detailed requests as complex', () => {
    const long =
      'Please analyze the security vulnerabilities in our authentication module and refactor the entire login flow to use OAuth2 with PKCE. Also compare the performance implications of switching from JWT to opaque tokens across all microservices.';
    expect(classifyTurnComplexity(long)).toBe('complex');
  });

  it('classifies medium-length requests as moderate', () => {
    expect(
      classifyTurnComplexity(
        'Can you add a new REST endpoint to the user authentication API that handles OAuth2 token refresh and session management with proper error handling, rate limiting, input validation, and comprehensive logging for audit purposes across all microservices?',
      ),
    ).toBe('moderate');
  });

  it('keyword override forces complex regardless of length', () => {
    expect(classifyTurnComplexity('debug this')).toBe('complex');
    expect(classifyTurnComplexity('refactor now')).toBe('complex');
    expect(classifyTurnComplexity('security audit')).toBe('complex');
  });

  it('respects custom thresholds', () => {
    expect(classifyTurnComplexity('short msg', { simpleThreshold: 50 })).toBe('simple');
    expect(
      classifyTurnComplexity('x'.repeat(100), { simpleThreshold: 50, complexThreshold: 150 }),
    ).toBe('moderate');
    expect(
      classifyTurnComplexity('x'.repeat(200), { simpleThreshold: 50, complexThreshold: 150 }),
    ).toBe('complex');
  });
});

describe('agent routing map', () => {
  const routingMap: AgentRoutingEntry[] = [
    { agentPattern: 'code-reviewer', preferredTier: 'complex', priority: 1 },
    { agentPattern: 'quick-fixer', preferredTier: 'simple', priority: 1 },
    { agentPattern: 'writer-*', preferredTier: 'moderate', priority: 2 },
    { agentPattern: 'writer-docs', preferredTier: 'moderate', priority: 1 },
  ];

  it('matches exact agent patterns', () => {
    expect(matchesAgentPattern('code-reviewer', 'code-reviewer')).toBe(true);
    expect(matchesAgentPattern('code-reviewer', 'quick-fixer')).toBe(false);
  });

  it('matches wildcard agent patterns', () => {
    expect(matchesAgentPattern('writer-docs', 'writer-*')).toBe(true);
    expect(matchesAgentPattern('writer-tests', 'writer-*')).toBe(true);
    expect(matchesAgentPattern('reader-docs', 'writer-*')).toBe(false);
  });

  it('selects best agent for a tier by priority', () => {
    expect(selectAgentForTier('simple', routingMap)).toBe('quick-fixer');
    expect(selectAgentForTier('complex', routingMap)).toBe('code-reviewer');
    expect(selectAgentForTier('moderate', routingMap)).toBe('writer-docs'); // priority 1 < 2
  });

  it('returns undefined for unmatched tier', () => {
    const emptyMap: AgentRoutingEntry[] = [];
    expect(selectAgentForTier('simple', emptyMap)).toBeUndefined();
  });
});

describe('maxSteps subagent enforcement', () => {
  it('produces a summary when maxSteps is reached', async () => {
    let callCount = 0;
    const llm = async () => {
      callCount++;
      if (callCount <= 2) {
        return new AIMessage('working on it', {
          toolCalls: [{ id: `tc_${callCount}`, name: 'echo', arguments: {} }],
        });
      }
      // Final call should be the summary request
      return new AIMessage('Summary: completed 2 steps, no remaining work.');
    };

    const agent = createReActAgent({
      config: {
        name: 'subagent',
        maxSteps: 2,
        maxIterations: 10,
        tools: [{ name: 'echo', description: 'echo', parameters: {}, execute: async () => 'done' }],
      },
      llmCall: llm,
    });

    const result = await agent.run('do something');
    // Should have called LLM 3 times: 2 tool turns + 1 summary
    expect(callCount).toBe(3);
    expect(result.output).toContain('Summary');
  });

  it('runs normally when maxSteps is not set', async () => {
    const llm = async () => new AIMessage('final answer');
    const agent = createReActAgent({
      config: { name: 'normal', maxIterations: 5 },
      llmCall: llm,
    });
    const result = await agent.run('hi');
    expect(result.output).toBe('final answer');
  });
});
