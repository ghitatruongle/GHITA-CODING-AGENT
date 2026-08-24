import { describe, it, expect } from 'vitest';
import { AdaptiveReasoningController } from './reasoning-budget.js';

describe('AdaptiveReasoningController', () => {
  const controller = new AdaptiveReasoningController();

  it('allocates 0 thinking tokens for simple greetings and acknowledgements', () => {
    const res = controller.calculateBudget({
      prompt: 'hello, how are you?',
    });

    expect(res.tier).toBe('simple');
    expect(res.thinkingBudget).toBe(0);
    expect(res.remainingContextTokens).toBeGreaterThan(100_000);
  });

  it('allocates base moderate thinking tokens for standard prompts', () => {
    const res = controller.calculateBudget({
      prompt:
        'Please process the following data payload and extract the user authentication credentials for each registered service account in the active session.',
    });

    expect(res.tier).toBe('moderate');
    expect(res.thinkingBudget).toBeGreaterThanOrEqual(2048);
  });

  it('scales reasoning budget for complex architecture and deep refactoring with AST and blast radius', () => {
    const res = controller.calculateBudget({
      prompt:
        'Please architect a distributed event sourcing engine and refactor the core transaction subsystem.',
      astNodesCount: 150,
      astDepth: 8,
      blastRadius: 15,
    });

    expect(res.tier).toBe('complex');
    expect(res.thinkingBudget).toBeGreaterThan(8192);
    expect(res.explanation).toContain('AST multiplier');
  });

  it('respects tight context headroom and caps reasoning budget accordingly', () => {
    const tightController = new AdaptiveReasoningController({
      defaultMaxContext: 8000,
      defaultMaxOutput: 4000,
    });

    const res = tightController.calculateBudget({
      prompt: 'Architect and redesign the whole microservices infrastructure from scratch.',
    });

    expect(res.tier).toBe('complex');
    // Context headroom is bounded (approx (8000 - prompt - 4000) * 0.5)
    expect(res.thinkingBudget).toBeLessThanOrEqual(2000);
    expect(res.remainingContextTokens).toBeGreaterThanOrEqual(0);
  });
});
