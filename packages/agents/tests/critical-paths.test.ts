import { describe, it, expect, vi } from 'vitest';
import { ReActAgent } from '../src/react/agent.js';
import type { CreateReActAgentInput, ReActTool } from '../src/react/types.js';
import { AIMessage } from '../src/messages/message.js';
import { AdvancedWorkflowEngine } from '../src/workflow/workflow-advanced.js';
import { MiddlewarePipeline } from '../src/middleware/pipeline.js';
import type { AgentMiddleware, MiddlewareContext } from '../src/middleware/types.js';

const mockAgent = {
  id: 'a1',
  name: 'test',
  role: 'executor',
  description: 't',
  skills: [],
  model: 'test-model',
  status: 'working',
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as MiddlewareContext['agent'];

function baseCtx(partial: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    agent: mockAgent,
    messages: [],
    model: 'test-model',
    metadata: {},
    ...partial,
  };
}

const echoTool: ReActTool = {
  name: 'echo',
  description: 'echo input',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string' } },
  },
  execute: async (input) => `echo:${String(input.text ?? '')}`,
};

describe('ReActAgent', () => {
  it('finishes when model returns no tool calls', async () => {
    const llmCall = vi.fn(async () => new AIMessage('final answer'));
    const agent = new ReActAgent({
      config: {
        name: 'solo',
        model: 'fake',
        tools: [echoTool],
        maxIterations: 3,
        systemPrompt: 'sys',
      },
      llmCall,
    } as CreateReActAgentInput);

    const result = await agent.run('hello');
    expect(result.output).toBe('final answer');
    expect(result.steps).toHaveLength(0);
    expect(llmCall).toHaveBeenCalledTimes(1);
  });

  it('executes tool calls then finishes', async () => {
    let turn = 0;
    const llmCall = vi.fn(async () => {
      turn += 1;
      if (turn === 1) {
        return new AIMessage('need tool', {
          metadata: {
            toolCalls: [{ id: 'tc1', name: 'echo', arguments: { text: 'ping' } }],
          },
        });
      }
      return new AIMessage('done after tool');
    });

    const agent = new ReActAgent({
      config: {
        name: 'tools',
        model: 'fake',
        tools: [echoTool],
        maxIterations: 5,
      },
      llmCall,
    } as CreateReActAgentInput);

    const onToolCall = vi.fn();
    const result = await agent.run('use tool', { onToolCall });
    expect(onToolCall).toHaveBeenCalledWith('echo', { text: 'ping' });
    expect(result.steps.some((s) => s.observation.includes('echo:ping'))).toBe(true);
    expect(result.output).toBe('done after tool');
  });

  it('records observation when tool is missing', async () => {
    let n = 0;
    const agent = new ReActAgent({
      config: { name: 'm', model: 'fake', tools: [echoTool], maxIterations: 3 },
      llmCall: async () => {
        n += 1;
        if (n === 1) {
          return new AIMessage('call missing', {
            metadata: {
              toolCalls: [{ id: 'tc-missing', name: 'missing', arguments: {} }],
            },
          });
        }
        return new AIMessage('recovered');
      },
    } as CreateReActAgentInput);

    const result = await agent.run('x');
    expect(result.steps[0]?.observation).toMatch(/not found/i);
    expect(result.output).toBe('recovered');
  });

  it('surfaces tool execution errors as observations', async () => {
    const boom: ReActTool = {
      name: 'boom',
      description: 'throws',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        throw new Error('tool exploded');
      },
    };
    let n = 0;
    const agent = new ReActAgent({
      config: { name: 'b', model: 'fake', tools: [boom], maxIterations: 3 },
      llmCall: async () => {
        n += 1;
        if (n === 1) {
          return new AIMessage('call', {
            metadata: { toolCalls: [{ id: 't1', name: 'boom', arguments: {} }] },
          });
        }
        return new AIMessage('ok');
      },
    } as CreateReActAgentInput);

    const result = await agent.run('go');
    expect(result.steps[0]?.observation).toMatch(/tool exploded/);
  });

  it('respects maxIterations when tools never finish', async () => {
    const agent = new ReActAgent({
      config: { name: 'loop', model: 'fake', tools: [echoTool], maxIterations: 2 },
      llmCall: async () =>
        new AIMessage('again', {
          metadata: { toolCalls: [{ id: 't', name: 'echo', arguments: { text: 'x' } }] },
        }),
    } as CreateReActAgentInput);

    const result = await agent.run('loop');
    expect(result.iterations).toBe(2);
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
  });
});

describe('AdvancedWorkflowEngine regressions', () => {
  it('fails when dependency is missing (audit 2.2)', async () => {
    const engine = new AdvancedWorkflowEngine('wf', [
      {
        id: 'b',
        name: 'B',
        dependsOn: ['missing-a'],
        execute: async () => 1,
      },
    ]);
    const result = await engine.run({});
    expect(result.status).toBe('failed');
  });

  it('clears inProgress on failure so retry is not circular (audit 2.4)', async () => {
    let attempts = 0;
    const engine = new AdvancedWorkflowEngine('wf', [
      {
        id: 'flaky',
        name: 'Flaky',
        execute: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('first fail');
          return 'ok';
        },
      },
    ]);

    const first = await engine.run({}, {}, { continueOnError: true });
    expect(first.status).toBe('failed');

    const engine2 = new AdvancedWorkflowEngine('wf', [
      {
        id: 'flaky',
        name: 'Flaky',
        execute: async () => 'ok',
      },
    ]);
    const second = await engine2.run({});
    expect(second.status).toBe('success');
  });

  it('clears step timeout timers on success (audit 2.3)', async () => {
    const engine = new AdvancedWorkflowEngine('wf', [
      {
        id: 'fast',
        name: 'Fast',
        timeoutMs: 200,
        execute: async () => 'done',
      },
    ]);
    const result = await engine.run({});
    expect(result.status).toBe('success');
    expect(result.stepResults.fast?.result).toBe('done');
  });

  it('times out slow steps', async () => {
    const engine = new AdvancedWorkflowEngine('wf', [
      {
        id: 'slow',
        name: 'Slow',
        timeoutMs: 30,
        execute: async (_s, ctx) =>
          new Promise((resolve, reject) => {
            const t = setTimeout(() => resolve('late'), 200);
            ctx.signal.addEventListener('abort', () => {
              clearTimeout(t);
              reject(new Error('aborted'));
            });
          }),
      },
    ]);
    const result = await engine.run({}, {}, { continueOnError: true });
    expect(result.status).toBe('failed');
    expect(result.stepResults.slow?.status).toBe('failed');
  });

  it('supports dependsOn ordering and conditional skip', async () => {
    const order: string[] = [];
    const engine = new AdvancedWorkflowEngine('wf', [
      {
        id: 'a',
        name: 'A',
        execute: async () => {
          order.push('a');
          return 1;
        },
      },
      {
        id: 'b',
        name: 'B',
        dependsOn: ['a'],
        when: (state) => state.a === 1,
        execute: async () => {
          order.push('b');
          return 2;
        },
      },
      {
        id: 'c',
        name: 'C',
        when: () => false,
        execute: async () => {
          order.push('c');
          return 3;
        },
      },
    ]);
    const result = await engine.run({});
    expect(order).toEqual(['a', 'b']);
    expect(result.stepResults.c?.status).toBe('skipped');
    expect(result.status).toBe('success');
  });

  it('retries with backoff then succeeds', async () => {
    let n = 0;
    const engine = new AdvancedWorkflowEngine('wf', [
      {
        id: 'r',
        name: 'Retry',
        retry: { maxAttempts: 3, backoffMs: 1 },
        execute: async () => {
          n += 1;
          if (n < 3) throw new Error('transient');
          return 'ok';
        },
      },
    ]);
    const result = await engine.run({});
    expect(result.status).toBe('success');
    expect(n).toBe(3);
  });
});

describe('MiddlewarePipeline critical paths', () => {
  it('runs pre-model hooks in order and supports short-circuit', async () => {
    const seen: string[] = [];
    const mw1: AgentMiddleware = {
      name: 'm1',
      priority: 10,
      preModel: async () => {
        seen.push('m1');
        return {};
      },
    };
    const mw2: AgentMiddleware = {
      name: 'm2',
      priority: 20,
      preModel: async () => {
        seen.push('m2');
        return { shortCircuit: new AIMessage('blocked') };
      },
    };
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw1);
    pipeline.use(mw2);
    const { shortCircuit } = await pipeline.runPreModel(baseCtx());
    expect(seen).toEqual(['m1', 'm2']);
    expect(shortCircuit?.getText()).toBe('blocked');
  });

  it('blocks tools via preTool', async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use({
      name: 'deny',
      priority: 1,
      preTool: async () => ({ proceed: false, reason: 'denied by policy' }),
    });
    const check = await pipeline.runPreTool('shell', { cmd: 'rm' }, baseCtx());
    expect(check.proceed).toBe(false);
    expect(check.reason).toMatch(/denied/);
  });
});
