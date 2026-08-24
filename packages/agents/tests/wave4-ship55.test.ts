// Wave 4 — ship agents coverage to 55% (runtime / AP / cron / SDK)

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AgentManager,
  createDefaultAgentManager,
  createDefaultAgentGroupManager,
} from '../src/runtime.js';
import { AgentProtocolServer } from '../src/protocol/ap.js';
import { CronScheduler } from '../src/scheduler/cron.js';
import { GhitAgentClient } from '../src/sdk/client.js';

describe('AgentManager', () => {
  it('creates, lists, updates, removes agents', () => {
    const mgr = new AgentManager();
    const a = mgr.create({
      name: 'Coder',
      role: 'executor',
      description: 'writes code',
      skills: ['echo'],
    });
    expect(a.id).toMatch(/^agent_/);
    expect(mgr.get(a.id)?.name).toBe('Coder');
    expect(mgr.list()).toHaveLength(1);
    expect(mgr.listByRole('executor')).toHaveLength(1);

    const updated = mgr.update(a.id, { description: 'updated' });
    expect(updated.description).toBe('updated');
    expect(mgr.remove(a.id)).toBe(true);
    expect(mgr.get(a.id)).toBeUndefined();
  });

  it('registers external agent and assigns tasks with custom runtime', async () => {
    const runtime = vi.fn(async ({ task }) => `done:${task.description}`);
    const memory = {
      injectContext: () => 'ctx',
      remember: vi.fn(),
    };
    const skill = { run: vi.fn(async () => ({ ok: true })) };
    const mgr = new AgentManager(runtime, { echo: skill }, memory);

    const agent = mgr.register({
      id: 'ext-1',
      name: 'Ext',
      role: 'planner',
      description: 'external',
      skills: ['echo'],
    });

    const task = await mgr.assignTask(agent.id, 'build feature', 'g1');
    expect(task.status).toBe('completed');
    expect(String(task.result)).toContain('build feature');
    expect(runtime).toHaveBeenCalled();
    expect(memory.remember).toHaveBeenCalled();
    expect(mgr.listTasks(agent.id)).toHaveLength(1);
  });

  it('records failed task when runtime throws', async () => {
    const mgr = new AgentManager(async () => {
      throw new Error('boom');
    });
    const agent = mgr.create({ name: 'X', role: 'executor', description: 'd' });
    const task = await mgr.assignTask(agent.id, 'fail me');
    expect(task.status).toBe('failed');
    expect(task.error).toMatch(/boom/);
    expect(mgr.get(agent.id)?.status).toBe('error');
  });

  it('default runtime uses skills and memory context', async () => {
    const skill = {
      run: async () => ({ value: 1 }),
    };
    const memory = {
      injectContext: () => 'remembered',
      remember: vi.fn(),
    };
    const mgr = createDefaultAgentManager({ echo: skill }, memory);
    const agent = mgr.create({
      name: 'Default',
      role: 'executor',
      description: 'd',
      skills: ['echo'],
    });
    const task = await mgr.assignTask(agent.id, 'use skills');
    expect(task.status).toBe('completed');
    expect(String(task.result)).toMatch(/Skill Results|Default|use skills/);
  });
});

describe('AgentGroupManager', () => {
  it('creates groups and lists them', async () => {
    const agents = new AgentManager(async ({ task }) => `ok:${task.description}`);
    const a = agents.create({ name: 'A', role: 'executor', description: 'a' });
    const b = agents.create({ name: 'B', role: 'planner', description: 'b' });
    const { AgentGroupManager } = await import('../src/runtime.js');
    const groups = new AgentGroupManager(agents);
    const g = groups.create({
      name: 'Team',
      description: 't',
      agents: [a.id],
      task: 'ship',
    });
    expect(g.id).toMatch(/^group_/);
    expect(groups.get(g.id)?.name).toBe('Team');
    expect(groups.list()).toHaveLength(1);
    groups.addAgent(g.id, b.id);
    expect(groups.get(g.id)?.agents).toContain(b.id);
    groups.removeAgent(g.id, b.id);
    expect(groups.get(g.id)?.agents).not.toContain(b.id);
    const tasks = await groups.runGroup(g.id, 'group work');
    expect(tasks.length).toBe(1);
    expect(tasks[0]?.status).toBe('completed');
  });

  it('createDefaultAgentGroupManager seeds default teams', () => {
    const agents = createDefaultAgentManager();
    const groups = createDefaultAgentGroupManager(agents);
    expect(groups.list().length).toBeGreaterThanOrEqual(3);
    expect(agents.list().length).toBeGreaterThanOrEqual(4);
  });
});

describe('AgentProtocolServer', () => {
  it('creates tasks, steps, and artifacts', () => {
    const ap = new AgentProtocolServer();
    const task = ap.createTask('do work', { priority: 1 });
    expect(task.taskId).toMatch(/^task-/);
    expect(ap.listTasks()).toContain(task.taskId);
    expect(ap.getTask(task.taskId)?.input).toBe('do work');

    const step = ap.executeStep(task.taskId, 'step input');
    expect(step?.status).toBe('completed');
    expect(ap.getTaskSteps(task.taskId)).toHaveLength(1);
    expect(ap.getStep(task.taskId, step.stepId)?.stepId).toBe(step.stepId);

    const art = ap.addArtifact(task.taskId, 'out.txt', 'out/out.txt');
    expect(art?.fileName).toBe('out.txt');
    expect(ap.getTaskArtifacts(task.taskId)).toHaveLength(1);
    expect(ap.executeStep('missing', 'x')).toBeUndefined();
  });
});

describe('CronScheduler', () => {
  it('registers natural language interval tasks', async () => {
    vi.useFakeTimers();
    const assignTask = vi.fn(async () => ({ id: 't', status: 'completed' }));
    const agentManager = {
      list: () => [{ id: 'agent-1' }],
      assignTask,
    };

    const cron = new CronScheduler(agentManager);
    cron.start();
    const task = cron.addTask({
      id: 'job-1',
      expression: 'every 1 seconds',
      taskDescription: 'tick',
      maxIterations: 2,
    });
    expect(task.status).toBe('active');
    expect(cron.listTasks().length).toBe(1);
    expect(cron.getTask('job-1')).toBeTruthy();
    expect(cron.removeTask('job-1')).toBe(true);
    cron.stop();
    vi.useRealTimers();
  });
});

describe('GhitAgentClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sendMessage / getStatus / getProviders / runRalphLoop', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/chat')) {
        return new Response(JSON.stringify({ role: 'assistant', content: 'hi', timestamp: 1 }), {
          status: 200,
        });
      }
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok', version: '0.1.5' }), { status: 200 });
      }
      if (url.endsWith('/api/providers')) {
        return new Response(JSON.stringify({ providers: ['openai', 'ollama'] }), { status: 200 });
      }
      if (url.endsWith('/api/subagents')) {
        return new Response(JSON.stringify({ subagents: [{ id: 's1' }] }), { status: 200 });
      }
      if (url.endsWith('/api/ralph-loop')) {
        return new Response(JSON.stringify({ ok: true, iterations: 2 }), { status: 200 });
      }
      return new Response('nope', { status: 404 });
    });

    const client = new GhitAgentClient({ serverUrl: 'http://localhost:8080', apiKey: 'k' });
    const msg = await client.sendMessage('hello', { provider: 'openai' });
    expect(msg.content).toBe('hi');
    expect(await client.getStatus()).toEqual({ status: 'ok', version: '0.1.5' });
    expect(await client.getProviders()).toEqual(['openai', 'ollama']);
    expect(await client.getSubagents()).toEqual([{ id: 's1' }]);
    expect(await client.runRalphLoop('task', 3)).toMatchObject({ ok: true });
  });

  it('getSubagents returns [] on network failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const client = new GhitAgentClient({ serverUrl: 'http://localhost:1' });
    expect(await client.getSubagents()).toEqual([]);
  });
});

import {
  processEvent,
  resumeThread,
  handleResumeRequest,
  createInitialThreadState,
  InMemoryThreadStore,
} from '../src/flow/reducer.js';

describe('Thread reducer', () => {
  it('is idempotent and processes message/tool/error events', () => {
    let state = createInitialThreadState('th1');
    const msg = {
      eventId: 'e1',
      threadId: 'th1',
      timestamp: '2026-01-01T00:00:00Z',
      seq: 0,
      type: 'message',
      role: 'user',
      content: 'hi',
      tokens: { input: 2, output: 0 },
    };
    state = processEvent(state, msg);
    const again = processEvent(state, msg);
    expect(again).toBe(state); // same reference when idempotent
    expect(state.messages).toContain('e1');
    expect(state.tokenUsage.input).toBe(2);

    state = processEvent(state, {
      eventId: 'e2',
      threadId: 'th1',
      timestamp: '2026-01-01T00:00:01Z',
      seq: 1,
      type: 'tool_call',
      toolName: 'echo',
      input: {},
      status: 'completed',
    });
    expect(state.toolCalls.e2?.toolName).toBe('echo');

    state = processEvent(state, {
      eventId: 'e3',
      threadId: 'th1',
      timestamp: '2026-01-01T00:00:02Z',
      seq: 2,
      type: 'error',
      code: 'X',
      message: 'bad',
      recoverable: false,
    });
    expect(state.status).toBe('failed');
    expect(state.errors.e3?.code).toBe('X');
  });

  it('resumes thread via store and validates resume requests', () => {
    const store = new InMemoryThreadStore();
    const events = [
      {
        eventId: 'm1',
        threadId: 't2',
        timestamp: '2026-01-01T00:00:00Z',
        seq: 0,
        type: 'message',
        role: 'user',
        content: 'a',
      },
      {
        eventId: 'm2',
        threadId: 't2',
        timestamp: '2026-01-01T00:00:01Z',
        seq: 1,
        type: 'message',
        role: 'assistant',
        content: 'b',
      },
    ];
    const state = resumeThread(store, 't2', events);
    expect(state.messages).toEqual(['m1', 'm2']);
    expect(store.list()).toContain('t2');

    const bad = handleResumeRequest(store, { threadId: '', events: [] });
    expect(bad.ok).toBe(false);
    const ok = handleResumeRequest(store, { threadId: 't2', events });
    expect(ok.ok).toBe(true);
    expect(ok.state?.lastSeq).toBe(1);
  });
});
