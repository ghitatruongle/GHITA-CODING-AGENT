// ==============================================================================
// GHITA CODING AGENT - DebateEngine Unit Tests (Phase 6)
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { DebateEngine, AIMessage } from '@ghita/agents';

describe('Debate-Driven Architectural Alignment (DDAA)', () => {
  let callsCount = 0;
  let callsHistory: any[] = [];

  beforeEach(() => {
    callsCount = 0;
    callsHistory = [];
  });

  it('should run a debate for exactly 3 turns and return finalized spec with consensus score', async () => {
    const mockLlmCall = async (messages: any[], options?: any) => {
      callsCount++;
      const lastMessage = messages[messages.length - 1];
      const systemMessage = messages[0];

      callsHistory.push({
        system: systemMessage.getText(),
        input: lastMessage.getText(),
      });

      const sysText = systemMessage.getText();
      if (sysText.includes('Editor-in-Chief')) {
        return new AIMessage(
          JSON.stringify({
            consensusScore: 9,
            spec: '# Final Approved Technical Specification\n\n1. System architecture is robust.\n2. Security guardrails implemented successfully.\n3. Performance tested.',
          }),
        );
      } else if (sysText.includes('Innovator')) {
        return new AIMessage(
          `[Innovator Draft Spec] - Turn ${callsCount} - Solving the problem elegantly.`,
        );
      } else if (sysText.includes("Devil's Advocate")) {
        return new AIMessage(
          `[Devil's Advocate Critique] - Turn ${callsCount} - Pointing out security/perf issues.`,
        );
      }

      return new AIMessage('Default response');
    };

    const engine = new DebateEngine({
      llmCall: mockLlmCall,
      model: 'gpt-4o',
    });

    const turnsStarted: string[] = [];
    const turnsEnded: string[] = [];
    let approvalTriggered = false;

    const result = await engine.runDebate(
      'Tích hợp Docker Sandbox cho Computer Use',
      'Tài liệu về Dockerode và volumes mount an toàn.',
      {
        onTurnStart: (role, turn) => {
          turnsStarted.push(`${role}_${turn}`);
        },
        onTurnEnd: (role, turn, content) => {
          turnsEnded.push(`${role}_${turn}`);
        },
        onApprovalRequired: async (spec, score) => {
          approvalTriggered = true;
          expect(score).toBe(9);
          expect(spec).toContain('Final Approved Technical Specification');
          return true; // Approve
        },
      },
    );

    expect(callsCount).toBe(7);
    expect(result.consensusScore).toBe(9);
    expect(result.spec).toContain('Final Approved Technical Specification');
    expect(result.debateLog).toContain('[Lượt 1 - Innovator]');
    expect(result.debateLog).toContain('[Lượt 3 - DevilAdvocate]');
    expect(result.approved).toBe(true);
    expect(approvalTriggered).toBe(true);

    expect(turnsStarted).toContain('Innovator_1');
    expect(turnsStarted).toContain('DevilAdvocate_1');
    expect(turnsStarted).toContain('Innovator_3');
    expect(turnsStarted).toContain('DevilAdvocate_3');
    expect(turnsStarted).toContain('EIC_4');
  });

  it('should support rejection in approval process', async () => {
    const mockLlmCall = async (messages: any[]) => {
      const sysText = messages[0].getText();
      if (sysText.includes('Editor-in-Chief')) {
        return new AIMessage(
          JSON.stringify({
            consensusScore: 4,
            spec: 'Rejected spec draft.',
          }),
        );
      }
      return new AIMessage('General output');
    };

    const engine = new DebateEngine({
      llmCall: mockLlmCall,
    });

    const result = await engine.runDebate('Test', 'Docs', {
      onApprovalRequired: async (spec, score) => {
        expect(score).toBe(4);
        return false;
      },
    });

    expect(result.approved).toBe(false);
    expect(result.consensusScore).toBe(4);
    expect(result.spec).toBe('Rejected spec draft.');
  });

  // ==========================================
  // Nâng cấp: Auto-approve khi không có callback
  // ==========================================
  it('should auto-approve when no approval callback provided', async () => {
    const mockLlmCall = async (messages: any[]) => {
      const sysText = messages[0].getText();
      if (sysText.includes('Editor-in-Chief')) {
        return new AIMessage(
          JSON.stringify({
            consensusScore: 8,
            spec: 'Auto-approved spec.',
          }),
        );
      }
      return new AIMessage('Draft');
    };

    const engine = new DebateEngine({ llmCall: mockLlmCall });
    const result = await engine.runDebate('Topic', 'Docs');
    expect(result.approved).toBe(true);
    expect(result.consensusScore).toBe(8);
  });

  // ==========================================
  // Nâng cấp: EIC trả về invalid JSON
  // ==========================================
  it('should handle EIC returning invalid JSON gracefully', async () => {
    const mockLlmCall = async (messages: any[]) => {
      const sysText = messages[0].getText();
      if (sysText.includes('Editor-in-Chief')) {
        return new AIMessage('This is not valid JSON at all, just plain text spec.');
      }
      return new AIMessage('Draft');
    };

    const engine = new DebateEngine({ llmCall: mockLlmCall });
    const result = await engine.runDebate('Topic', 'Docs');
    expect(result.consensusScore).toBe(7); // default fallback
    expect(result.spec).toBe('This is not valid JSON at all, just plain text spec.');
  });

  // ==========================================
  // Nâng cấp: EIC trả về partial JSON
  // ==========================================
  it('should handle EIC returning partial JSON (missing spec)', async () => {
    const mockLlmCall = async (messages: any[]) => {
      const sysText = messages[0].getText();
      if (sysText.includes('Editor-in-Chief')) {
        return new AIMessage(JSON.stringify({ consensusScore: 8 }));
      }
      return new AIMessage('Draft');
    };

    const engine = new DebateEngine({ llmCall: mockLlmCall });
    const result = await engine.runDebate('Topic', 'Docs');
    expect(result.consensusScore).toBe(8);
    // spec falls back to raw text since parsed.spec is falsy
    expect(result.spec).toBeDefined();
  });

  // ==========================================
  // Nâng cấp: All 6 debate entries in log
  // ==========================================
  it('should include all 6 debate entries in log', async () => {
    const mockLlmCall = async (messages: any[]) => {
      const sysText = messages[0].getText();
      if (sysText.includes('Editor-in-Chief')) {
        return new AIMessage(JSON.stringify({ consensusScore: 7, spec: 'Final' }));
      }
      return new AIMessage('Response');
    };

    const engine = new DebateEngine({ llmCall: mockLlmCall });
    const result = await engine.runDebate('Topic', 'Docs');

    expect(result.debateLog).toContain('[Lượt 1 - Innovator]');
    expect(result.debateLog).toContain('[Lượt 1 - DevilAdvocate]');
    expect(result.debateLog).toContain('[Lượt 2 - Innovator]');
    expect(result.debateLog).toContain('[Lượt 2 - DevilAdvocate]');
    expect(result.debateLog).toContain('[Lượt 3 - Innovator]');
    expect(result.debateLog).toContain('[Lượt 3 - DevilAdvocate]');
  });

  // ==========================================
  // Nâng cấp: Model option forwarding
  // ==========================================
  it('should forward model option to llmCall', async () => {
    const receivedOptions: any[] = [];
    const mockLlmCall = async (messages: any[], options?: any) => {
      receivedOptions.push(options);
      const sysText = messages[0].getText();
      if (sysText.includes('Editor-in-Chief')) {
        return new AIMessage(JSON.stringify({ consensusScore: 9, spec: 'Done' }));
      }
      return new AIMessage('Draft');
    };

    const engine = new DebateEngine({ llmCall: mockLlmCall, model: 'custom-model-v2' });
    await engine.runDebate('Topic', 'Docs');

    expect(receivedOptions.length).toBe(7);
    for (const opts of receivedOptions) {
      expect(opts.model).toBe('custom-model-v2');
    }
  });

  // ==========================================
  // Nâng cấp: Empty topic and docs
  // ==========================================
  it('should handle empty topic and docs without crashing', async () => {
    const mockLlmCall = async (messages: any[]) => {
      const sysText = messages[0].getText();
      if (sysText.includes('Editor-in-Chief')) {
        return new AIMessage(JSON.stringify({ consensusScore: 5, spec: '' }));
      }
      return new AIMessage('Response');
    };

    const engine = new DebateEngine({ llmCall: mockLlmCall });
    const result = await engine.runDebate('', '');
    expect(result).toBeDefined();
    expect(typeof result.consensusScore).toBe('number');
  });

  // ==========================================
  // Nâng cấp: Callback ordering
  // ==========================================
  it('should call callbacks in correct order', async () => {
    const callOrder: string[] = [];
    const mockLlmCall = async (messages: any[]) => {
      const sysText = messages[0].getText();
      if (sysText.includes('Editor-in-Chief')) {
        return new AIMessage(JSON.stringify({ consensusScore: 7, spec: 'Final' }));
      }
      return new AIMessage('Draft');
    };

    const engine = new DebateEngine({ llmCall: mockLlmCall });
    await engine.runDebate('Topic', 'Docs', {
      onTurnStart: (role, turn) => callOrder.push(`start_${role}_${turn}`),
      onTurnEnd: (role, turn) => callOrder.push(`end_${role}_${turn}`),
    });

    // Verify sequential ordering
    expect(callOrder).toEqual([
      'start_Innovator_1',
      'end_Innovator_1',
      'start_DevilAdvocate_1',
      'end_DevilAdvocate_1',
      'start_Innovator_2',
      'end_Innovator_2',
      'start_DevilAdvocate_2',
      'end_DevilAdvocate_2',
      'start_Innovator_3',
      'end_Innovator_3',
      'start_DevilAdvocate_3',
      'end_DevilAdvocate_3',
      'start_EIC_4',
      'end_EIC_4',
    ]);
  });
});
