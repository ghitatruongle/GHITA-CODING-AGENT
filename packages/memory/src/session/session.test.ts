import { describe, it, expect } from 'vitest';
import { SessionManager, InMemorySessionStore, type SessionStore } from './session.js';

describe('Session Management', () => {
  it('creates session', async () => {
    const mgr = new SessionManager();
    const s = await mgr.createSession('Test Session');
    expect(s.id).toBeDefined();
    expect(s.name).toBe('Test Session');
    expect(s.status).toBe('active');
    expect(s.messages.length).toBe(0);
    expect(mgr.getActiveSessionId()).toBe(s.id);
  });

  it('handles lifecycle (create -> pause -> resume -> archive)', async () => {
    const mgr = new SessionManager();
    const s = await mgr.createSession('Lifecycle Test');

    await mgr.pauseSession(s.id);
    let loaded = await mgr.getSession(s.id);
    expect(loaded?.status).toBe('paused');

    await mgr.resumeSession(s.id);
    loaded = await mgr.getSession(s.id);
    expect(loaded?.status).toBe('active');

    await mgr.archiveSession(s.id);
    loaded = await mgr.getSession(s.id);
    expect(loaded?.status).toBe('archived');
    expect(mgr.getActiveSessionId()).toBeNull();
  });

  it('adds messages and tracks token usage', async () => {
    const mgr = new SessionManager();
    const s = await mgr.createSession('Messages Test');
    const msg = await mgr.addMessage(s.id, 'user', 'hello world', {
      tokens: { input: 5, output: 0 },
    });
    expect(msg.id).toBeDefined();
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('hello world');
    const loaded = await mgr.getSession(s.id);
    expect(loaded?.tokenUsage.input).toBe(5);
  });

  it('locks archived session from adding messages', async () => {
    const mgr = new SessionManager();
    const s = await mgr.createSession('Lock Test');
    await mgr.archiveSession(s.id);
    await expect(mgr.addMessage(s.id, 'user', 'should fail')).rejects.toThrow();
  });

  it('performs full-text search', async () => {
    const mgr = new SessionManager();
    const s1 = await mgr.createSession('S1');
    await mgr.addMessage(s1.id, 'user', 'apple banana cherry');
    const s2 = await mgr.createSession('S2');
    await mgr.addMessage(s2.id, 'user', 'apple pie recipe');

    const results = await mgr.search('apple');
    expect(results.length).toBe(2);

    const banana = await mgr.search('banana');
    expect(banana.length).toBe(1);

    const multi = await mgr.search('apple pie');
    expect(multi.length).toBe(2);
    expect(multi[0]?.sessionId).toBe(s2.id);
    expect(multi[0]?.score).toBeGreaterThan(multi[1]?.score);
  });

  it('handles multi-session switch', async () => {
    const mgr = new SessionManager();
    const s1 = await mgr.createSession('S1');
    const s2 = await mgr.createSession('S2');
    expect(mgr.getActiveSessionId()).toBe(s2.id);

    await mgr.switchActiveSession(s1.id);
    expect(mgr.getActiveSessionId()).toBe(s1.id);
  });

  it('exports and imports single session', async () => {
    const mgr1 = new SessionManager();
    const s = await mgr1.createSession('Export Test');
    await mgr1.addMessage(s.id, 'user', 'important data');

    const json = await mgr1.exportSession(s.id);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('Export Test');

    const mgr2 = new SessionManager();
    const imported = await mgr2.importSession(json);
    expect(imported.status).toBe('active');
    expect(imported.messages.length).toBe(1);
  });

  it('exports all sessions', async () => {
    const mgr = new SessionManager();
    await mgr.createSession('A');
    await mgr.createSession('B');
    const all = await mgr.exportAll();
    const parsed = JSON.parse(all);
    expect(parsed.sessions.length).toBe(2);
    expect(parsed.version).toBe(1);
  });

  it('deletes session', async () => {
    const mgr = new SessionManager();
    const s = await mgr.createSession('Delete Test');
    await mgr.deleteSession(s.id);
    const loaded = await mgr.getSession(s.id);
    expect(loaded).toBeNull();
    expect(mgr.getActiveSessionId()).toBeNull();
  });

  it('in-memory store propagates to persistent backend hook', async () => {
    const saved: string[] = [];
    const fakeBackend: SessionStore = {
      load: async (_id) => null,
      save: async (s) => {
        saved.push(s.id);
      },
      delete: async (id) => {
        saved.push(`DELETE:${id}`);
      },
      listIds: async () => [],
      search: async () => [],
    };
    const store = new InMemorySessionStore(fakeBackend);
    const mgr = new SessionManager(store);
    const s = await mgr.createSession('Persistence Test');
    expect(saved.length).toBe(1);
    expect(saved[0]).toBe(s.id);
  });

  it('truncates search snippets', async () => {
    const mgr = new SessionManager();
    const s = await mgr.createSession('Snippet Test');
    const longContent = 'unicorn '.repeat(50);
    await mgr.addMessage(s.id, 'user', longContent);
    const results = await mgr.search('unicorn');
    expect(results.length).toBe(1);
    expect(results[0]?.snippet.endsWith('…')).toBe(true);
  });

  it('rejects invalid import JSON', async () => {
    const mgr = new SessionManager();
    await expect(mgr.importSession('not valid json {')).rejects.toThrow();
  });
});
