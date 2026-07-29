// ==============================================================================
// v0.4.9 A2: ReActAgent Policy Guard Integration Tests
//
// Verifies the deny-default policy guard hook blocks tool execution before it
// runs and feeds the denial reason back to the model, while allowed calls
// execute normally.
// ==============================================================================

import { describe, it, expect, vi } from 'vitest';
import { ReActAgent } from '../src/react/agent.js';
import type { CreateReActAgentInput, ReActTool, PolicyGuard } from '../src/react/types.js';
import { AIMessage } from '../src/messages/message.js';

const dangerTool: ReActTool = {
  name: 'terminal.exec',
  description: 'run a shell command',
  parameters: {
    type: 'object',
    properties: { command: { type: 'string' } },
  },
  execute: async (input) => `ran:${String(input.command ?? '')}`,
};

function agentWithGuard(guard: PolicyGuard, executeSpy?: () => void): ReActAgent {
  let turn = 0;
  const llmCall = vi.fn(async () => {
    turn += 1;
    if (turn === 1) {
      return new AIMessage('need tool', {
        metadata: {
          toolCalls: [
            { id: 'tc1', name: 'terminal.exec', arguments: { command: 'rm -rf /' } },
          ],
        },
      });
    }
    return new AIMessage('finished');
  });

  const tool: ReActTool = {
    ...dangerTool,
    execute: async (input) => {
      executeSpy?.();
      return `ran:${String(input.command ?? '')}`;
    },
  };

  return new ReActAgent({
    config: {
      name: 'guarded',
      model: 'fake',
      tools: [tool],
      maxIterations: 4,
      policyGuard: guard,
    },
    llmCall,
  } as CreateReActAgentInput);
}

describe('ReActAgent policy guard', () => {
  it('blocks a tool when the guard denies it and never executes it', async () => {
    const executeSpy = vi.fn();
    const guard = vi.fn<PolicyGuard>(() => ({
      decision: 'deny',
      reason: 'Destructive shell command blocked.',
    }));
    const agent = agentWithGuard(guard, executeSpy);

    const result = await agent.run('please clean up');

    expect(guard).toHaveBeenCalledTimes(1);
    // guard received a derived 'execute' action + resource from the command
    expect(guard.mock.calls[0]![0]).toMatchObject({
      tool: 'terminal.exec',
      action: 'execute',
      resource: 'rm -rf /',
    });
    expect(executeSpy).not.toHaveBeenCalled();
    const blockedStep = result.steps.find((s) => s.observation.includes('Policy denied'));
    expect(blockedStep).toBeDefined();
    expect(blockedStep!.observation).toContain('Destructive shell command blocked.');
  });

  it('allows a tool when the guard permits it', async () => {
    const executeSpy = vi.fn();
    const guard = vi.fn<PolicyGuard>(() => ({ decision: 'allow' }));
    const agent = agentWithGuard(guard, executeSpy);

    const result = await agent.run('run it');

    expect(guard).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(result.steps[0]!.observation).toBe('ran:rm -rf /');
  });

  it('supports async guards', async () => {
    const guard = vi.fn<PolicyGuard>(async () => {
      await Promise.resolve();
      return { decision: 'deny', reason: 'async deny' };
    });
    const agent = agentWithGuard(guard);
    const result = await agent.run('go');
    expect(result.steps[0]!.observation).toContain('async deny');
  });
});
