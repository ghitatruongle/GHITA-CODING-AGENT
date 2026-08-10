import { describe, it, expect } from 'vitest';
import { MemoryCaptureHooks } from './hooks.js';
import { ContradictionDetector, SupersedeTracker, cosine } from './contradiction.js';
import { ProvenanceStore, snapshotHash } from './provenance.js';

describe('MemoryCaptureHooks', () => {
  it('captures all hooks and dedups within the window', async () => {
    const events: string[] = [];
    const hooks = new MemoryCaptureHooks(
      async (e) => {
        events.push(e.hook);
      },
      { windowMs: 300_000 },
    );

    expect(await hooks.sessionStart('s1')).toBe(true);
    expect(await hooks.userPrompt('s1', 'fix the bug')).toBe(true);
    expect(await hooks.preTool('s1', 'grep_search', { pattern: 'x' })).toBe(true);
    expect(await hooks.postTool('s1', 'grep_search', true, 'found')).toBe(true);
    expect(await hooks.postTool('s1', 'grep_search', false, 'err')).toBe(true);
    expect(await hooks.preCompact('s1', 'summary text')).toBe(true);

    // Duplicate within window → dedup.
    expect(await hooks.userPrompt('s1', 'fix the bug')).toBe(false);
    expect(await hooks.postTool('s1', 'grep_search', true, 'found')).toBe(false);

    expect(events).toContain('session-start');
    expect(events).toContain('post-tool-failure');
    expect(hooks.stats().emitted).toBe(6);
  });

  it('allows same content in different sessions', async () => {
    const hooks = new MemoryCaptureHooks(async () => undefined, { windowMs: 300_000 });
    expect(await hooks.userPrompt('s1', 'same')).toBe(true);
    expect(await hooks.userPrompt('s2', 'same')).toBe(true);
  });
});

describe('ContradictionDetector', () => {
  const detector = new ContradictionDetector();

  it('detects polarity conflict and supersedes the older entry', async () => {
    const result = await detector.detect(
      { id: 'old', text: 'User prefers Windows', at: 100 },
      { id: 'new', text: 'User prefers macOS now', at: 200 },
    );
    expect(result.conflicting).toBe(true);
    expect(result.action).toBe('supersede');
  });

  it('keeps non-conflicting memories', async () => {
    const result = await detector.detect(
      { id: 'a', text: 'User likes TypeScript', at: 1 },
      { id: 'b', text: 'Project uses pnpm', at: 2 },
    );
    expect(result.conflicting).toBe(false);
  });

  it('uses embedder when provided', async () => {
    const embed = async (text: string) => {
      const vec = new Array(4).fill(0) as number[];
      for (let i = 0; i < text.length; i++) vec[i % 4] = (vec[i % 4] ?? 0) + text.charCodeAt(i);
      return vec;
    };
    const result = await detector.detect(
      { id: 'a', text: 'memory is enabled', at: 1 },
      { id: 'b', text: 'memory is disabled now', at: 2 },
      embed,
    );
    expect(result.conflicting).toBe(true);
  });
});

describe('SupersedeTracker', () => {
  it('tracks chains back to origin', () => {
    const tracker = new SupersedeTracker();
    tracker.record('v2', 'v1');
    tracker.record('v3', 'v2');
    expect(tracker.supersededBy('v3')).toBe('v2');
    expect(tracker.origin('v3')).toBe('v1');
  });
});

describe('cosine', () => {
  it('computes similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
});

describe('ProvenanceStore', () => {
  it('records history and rolls back', () => {
    const store = new ProvenanceStore();
    store.record({
      memoryId: 'm1',
      agentId: 'agent-a',
      namespace: 'private',
      source: 'session:1',
      content: 'v1',
    });
    store.record({
      memoryId: 'm1',
      agentId: 'agent-a',
      namespace: 'private',
      source: 'session:2',
      content: 'v2',
    });
    expect(store.history('m1')).toHaveLength(2);
    expect(store.latest('m1')?.snapshotHash).toBe(snapshotHash('v2'));
    expect(store.verify('m1', 'v2')).toBe(true);
    expect(store.verify('m1', 'v1')).toBe(false);

    const rollback = store.rollback('m1');
    expect(rollback?.snapshotHash).toBe(snapshotHash('v1'));
    expect(store.latest('m1')?.snapshotHash).toBe(snapshotHash('v1'));
  });

  it('separates namespaces', () => {
    const store = new ProvenanceStore();
    store.record({ memoryId: 'a', agentId: 'x', namespace: 'public', source: 's', content: 'p1' });
    store.record({ memoryId: 'b', agentId: 'y', namespace: 'private', source: 's', content: 'p2' });
    expect(store.listByNamespace('public')).toHaveLength(1);
    expect(store.listByNamespace('private', 'y')).toHaveLength(1);
  });
});
