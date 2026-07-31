import { describe, expect, it, vi } from 'vitest';
import {
  ReActAgent,
  ReActIterationLimitError,
  ReActResumeConfirmationRequiredError,
} from '../src/react/agent.js';
import { AIMessage } from '../src/messages/message.js';
import type { ReActCheckpoint, ReActTool } from '../src/react/types.js';

const echoTool = (execute: (text: string) => Promise<string>): ReActTool => ({
  name: 'echo',
  description: 'Echo text',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string' } },
  },
  execute: async (input) => execute(String(input.text ?? '')),
});

describe('ReAct durable checkpoints', () => {
  it('persists a completed, serializable run journal', async () => {
    const checkpoints: ReActCheckpoint[] = [];
    const agent = new ReActAgent({
      config: {
        name: 'durable',
        runId: 'run_complete',
        checkpoint: (checkpoint) => {
          checkpoints.push(structuredClone(checkpoint));
        },
      },
      llmCall: async () => new AIMessage('finished'),
    });

    const result = await agent.run('complete this');

    expect(result.runId).toBe('run_complete');
    expect(result.output).toBe('finished');
    expect(checkpoints.at(-1)).toMatchObject({
      version: 1,
      runId: 'run_complete',
      status: 'completed',
      maxIterations: 10,
      nextIteration: 1,
      pendingActions: [],
      output: 'finished',
    });
    expect(() => JSON.stringify(checkpoints.at(-1))).not.toThrow();
  });

  it('requires confirmation before replaying a pending tool after interruption', async () => {
    let interruptedCheckpoint: ReActCheckpoint | undefined;
    let simulateCrash = true;
    const execute = vi.fn(async (text: string) => `echo:${text}`);
    const firstAgent = new ReActAgent({
      config: {
        name: 'durable',
        runId: 'run_interrupted',
        tools: [echoTool(execute)],
        checkpoint: (checkpoint) => {
          interruptedCheckpoint = structuredClone(checkpoint);
          if (simulateCrash && checkpoint.pendingActions.length > 0) {
            simulateCrash = false;
            throw new Error('simulated process stop');
          }
        },
      },
      llmCall: async () =>
        new AIMessage('calling tool', {
          metadata: {
            toolCalls: [
              {
                id: 'call_echo',
                name: 'echo',
                arguments: { text: 'safe point' },
              },
            ],
          },
        }),
    });

    await expect(firstAgent.run('resume me')).rejects.toThrow('simulated process stop');
    expect(execute).not.toHaveBeenCalled();
    expect(interruptedCheckpoint?.pendingActions).toHaveLength(1);

    const unconfirmedAgent = new ReActAgent({
      config: {
        name: 'durable',
        tools: [echoTool(execute)],
        resumeFrom: interruptedCheckpoint,
      },
      llmCall: async () => new AIMessage('should not run'),
    });
    await expect(unconfirmedAgent.run('resume me')).rejects.toBeInstanceOf(
      ReActResumeConfirmationRequiredError,
    );
    expect(execute).not.toHaveBeenCalled();

    const resumedCheckpoints: ReActCheckpoint[] = [];
    const confirmedAgent = new ReActAgent({
      config: {
        name: 'durable',
        tools: [echoTool(execute)],
        resumeFrom: interruptedCheckpoint,
        resumePendingTools: true,
        checkpoint: (checkpoint) => {
          resumedCheckpoints.push(structuredClone(checkpoint));
        },
      },
      llmCall: async () => new AIMessage('resumed and finished'),
    });

    const result = await confirmedAgent.run('resume me');

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith('safe point');
    expect(result.output).toBe('resumed and finished');
    expect(result.steps.at(-1)?.observation).toBe('echo:safe point');
    expect(resumedCheckpoints.at(-1)?.status).toBe('completed');
    expect(resumedCheckpoints.at(-1)?.pendingActions).toEqual([]);
  });

  it('returns a completed checkpoint without calling the model again', async () => {
    let completed: ReActCheckpoint | undefined;
    const original = new ReActAgent({
      config: {
        name: 'durable',
        runId: 'run_already_done',
        checkpoint: (checkpoint) => {
          completed = structuredClone(checkpoint);
        },
      },
      llmCall: async () => new AIMessage('already complete'),
    });
    await original.run('same task');

    const llmCall = vi.fn(async () => new AIMessage('unexpected'));
    const resumed = new ReActAgent({
      config: {
        name: 'durable',
        resumeFrom: completed,
      },
      llmCall,
    });

    const result = await resumed.run('same task');

    expect(result.output).toBe('already complete');
    expect(llmCall).not.toHaveBeenCalled();
  });

  it('marks an iteration-limited run as exhausted instead of completed', async () => {
    const checkpoints: ReActCheckpoint[] = [];
    const agent = new ReActAgent({
      config: {
        name: 'limited',
        model: 'fake',
        maxIterations: 1,
        runId: 'run_limited',
        tools: [echoTool(async (text) => `echo:${text}`)],
        checkpoint: (checkpoint) => checkpoints.push(structuredClone(checkpoint)),
      },
      llmCall: async () =>
        new AIMessage('', {
          toolCalls: [{ id: 'limit-call', name: 'echo', arguments: { text: 'still working' } }],
        }),
    });

    await expect(agent.run('finish me')).rejects.toBeInstanceOf(ReActIterationLimitError);
    expect(checkpoints.at(-1)?.status).toBe('exhausted');
    expect(checkpoints.at(-1)?.output).toContain('maximum iteration limit');
  });
});
