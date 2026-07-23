// ==============================================================================
// Wave 3 — agents router / hub / channel / sync / debate
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { AgentRouter } from '../src/router/router.js';
import { HubClient } from '../src/hub/hub.js';
import { AgentChannel } from '../src/subagent/channel.js';
import { StateSyncManager } from '../src/subagent/sync.js';
import { DebateEngine } from '../src/orchestrator/debateEngine.js';
import { AIMessage } from '../src/messages/message.js';

describe('AgentRouter', () => {
  it('classifies simple / medium / high complexity', () => {
    const r = new AgentRouter();
    expect(r.estimateComplexity('hi')).toBe('simple');
    expect(r.estimateComplexity('fix bug in login form please')).toBe('medium');
    expect(r.estimateComplexity('refactor monorepo system design architecture')).toBe('high');
  });

  it('respects boundary modes and cost thresholds', () => {
    const r = new AgentRouter(0.05, 'low-cost-forced');
    expect(r.estimateComplexity('architect anything')).toBe('simple');
    r.setBoundaryMode('high-performance-forced');
    expect(r.estimateComplexity('hi')).toBe('high');

    r.setBoundaryMode('automatic');
    r.setMaxCostThreshold(0.0001);
    const route = r.resolveRoute('refactor monorepo system design');
    expect(route.provider).toBe('google');
    expect(route.model).toContain('gemini');
  });

  it('routes simple to ollama and medium to mini model', () => {
    const r = new AgentRouter();
    expect(r.resolveRoute('hello').provider).toBe('ollama');
    expect(r.resolveRoute('implement function parse json').provider).toBe('openai');
  });
});

describe('HubClient local mode', () => {
  it('registers, lists, gets, renders local prompts', () => {
    const hub = new HubClient({ serverUrl: 'http://localhost:9', namespace: 'ns' });
    const prompt = {
      name: 'greet',
      version: '1.0.0',
      template: 'Hello {{name}}!',
      model: 'gpt',
      author: 't',
      tags: [],
    };
    hub.registerLocal(prompt as never);
    expect(hub.listLocal()).toHaveLength(1);
    expect(hub.getLocal('greet', '1.0.0')?.name).toBe('greet');
    expect(hub.renderPrompt(prompt as never, { name: 'Ghita' })).toBe('Hello Ghita!');
    hub.clearCache();
    expect(hub.getCacheStats().size).toBe(0);
  });

  it('pull uses local store without network when registered as latest key', async () => {
    const hub = new HubClient({ serverUrl: 'http://127.0.0.1:1', namespace: 'default' });
    // pull looks for namespace/name@latest first in local after cache
    hub.registerLocal({
      name: 'x',
      version: 'latest',
      template: 'T',
      model: 'm',
      author: 'a',
      tags: [],
    } as never);
    // registerLocal keys as namespace/name@version — version 'latest'
    const p = await hub.pull('x', 'latest');
    expect(p.template).toBe('T');
  });
});

describe('AgentChannel', () => {
  it('publishes to subscribers and supports unsubscribe', async () => {
    const ch = new AgentChannel({ maxHistory: 10 });
    const seen: string[] = [];
    const subId = ch.subscribe('agent-b', 'topic', (msg) => {
      seen.push(String(msg.payload));
    });
    await ch.publish('agent-a', 'topic', 'hello');
    expect(seen).toEqual(['hello']);
    expect(ch.unsubscribe(subId)).toBe(true);
    await ch.publish('agent-a', 'topic', 'ignored');
    expect(seen).toEqual(['hello']);
  });

  it('dead-letters then flushes on late subscribe', async () => {
    const ch = new AgentChannel();
    await ch.publish('a', 'late', 'queued');
    const seen: unknown[] = [];
    ch.subscribe('b', 'late', (m) => {
      seen.push(m.payload);
    });
    expect(seen).toContain('queued');
  });

  it('send delivers direct messages and removeAgent cleans subs', async () => {
    const ch = new AgentChannel();
    const dm: unknown[] = [];
    ch.subscribe('target', 'dm:target', (m) => {
      dm.push(m.payload);
    });
    await ch.send('src', 'target', { hi: 1 });
    expect(dm).toEqual([{ hi: 1 }]);
    expect(ch.removeAgent('target')).toBeGreaterThanOrEqual(1);
  });
});

describe('StateSyncManager', () => {
  it('manages hierarchy and snapshots/diff', () => {
    const sync = new StateSyncManager({ maxSnapshotsPerAgent: 5 });
    sync.registerChild('parent', 'child');
    expect(sync.getChildren('parent')).toEqual(['child']);
    expect(sync.getParent('child')).toBe('parent');
    expect(sync.hasChildren('parent')).toBe(true);

    const s1 = sync.snapshot('child', { a: 1 });
    const s2 = sync.snapshot('child', { a: 2, b: 3 });
    expect(s1.version).toBe(1);
    expect(s2.version).toBe(2);
    expect(sync.getVersion('child')).toBe(2);
    expect(sync.getLatestSnapshot('child')?.data).toEqual({ a: 2, b: 3 });

    const d = sync.diff('child', 1, 2);
    expect(d).not.toBeNull();
    expect(d?.changed.a).toBe(2);
    expect(d?.added.b).toBe(3);

    const dataDiff = sync.diffData('child', { x: 1 }, { x: 2, y: 3 });
    expect(dataDiff.changed.x).toBe(2);
    expect(dataDiff.added.y).toBe(3);
    expect(dataDiff.removed).toEqual([]);

    const firstSync = sync.syncToParent('child', { a: 9 });
    expect(firstSync).not.toBeNull();

    sync.unregisterChild('child');
    expect(sync.getParent('child')).toBeUndefined();
  });

  it('returns null diffs for missing versions', () => {
    const sync = new StateSyncManager();
    expect(sync.diff('none', 1, 2)).toBeNull();
    expect(sync.syncToParent('orphan', { a: 1 })).toBeNull();
  });
});

describe('DebateEngine', () => {
  it('runs 3 turns with fake llm and honors approval callback', async () => {
    let n = 0;
    const engine = new DebateEngine({
      llmCall: async () => {
        n += 1;
        // EIC returns JSON block
        if (n > 6) {
          return new AIMessage('Final: {"consensusScore": 8, "spec": "final spec content"}');
        }
        return new AIMessage(`turn-content-${n}`);
      },
      model: 'fake',
    });

    const roles: string[] = [];
    const result = await engine.runDebate('topic', 'docs', {
      onTurnStart: (role) => {
        roles.push(role);
      },
      onApprovalRequired: async () => false,
    });

    expect(roles).toContain('Innovator');
    expect(roles).toContain('DevilAdvocate');
    expect(roles).toContain('EIC');
    expect(result.approved).toBe(false);
    expect(result.debateLog.length).toBeGreaterThan(0);
    expect(result.consensusScore).toBeGreaterThanOrEqual(0);
    expect(typeof result.spec).toBe('string');
  });
});
