// ==============================================================================
// GHITA CODING AGENT - Session Management Tests (Phase 24 — Update 0.0.3)
// ==============================================================================

import {
  SessionManager,
  InMemorySessionStore,
  type SessionStore,
} from './session.js';

// ----- Test 1: Create session -----
export async function testCreateSession() {
  const mgr = new SessionManager();
  const s = await mgr.createSession('Test Session');
  if (!s.id) throw new Error('session id missing');
  if (s.name !== 'Test Session') throw new Error('session name mismatch');
  if (s.status !== 'active') throw new Error('initial status should be active');
  if (s.messages.length !== 0) throw new Error('initial messages should be empty');
  if (mgr.getActiveSessionId() !== s.id) throw new Error('new session should be active');
  return 'PASS: create session';
}

// ----- Test 2: Lifecycle (create → pause → resume → archive) -----
export async function testLifecycle() {
  const mgr = new SessionManager();
  const s = await mgr.createSession('Lifecycle Test');

  await mgr.pauseSession(s.id);
  let loaded = await mgr.getSession(s.id);
  if (loaded?.status !== 'paused') throw new Error('expected paused');

  await mgr.resumeSession(s.id);
  loaded = await mgr.getSession(s.id);
  if (loaded?.status !== 'active') throw new Error('expected active after resume');

  await mgr.archiveSession(s.id);
  loaded = await mgr.getSession(s.id);
  if (loaded?.status !== 'archived') throw new Error('expected archived');
  if (mgr.getActiveSessionId() !== null) throw new Error('archived session should not be active');
  return 'PASS: lifecycle';
}

// ----- Test 3: Add messages -----
export async function testAddMessage() {
  const mgr = new SessionManager();
  const s = await mgr.createSession('Messages Test');
  const msg = await mgr.addMessage(s.id, 'user', 'hello world', { tokens: { input: 5, output: 0 } });
  if (!msg.id) throw new Error('message id missing');
  if (msg.role !== 'user') throw new Error('role mismatch');
  if (msg.content !== 'hello world') throw new Error('content mismatch');
  const loaded = await mgr.getSession(s.id);
  if (loaded?.tokenUsage.input !== 5) throw new Error('token usage not tracked');
  return 'PASS: add message';
}

// ----- Test 4: Cannot add to archived session -----
export async function testArchivedSessionLocked() {
  const mgr = new SessionManager();
  const s = await mgr.createSession('Lock Test');
  await mgr.archiveSession(s.id);
  let threw = false;
  try {
    await mgr.addMessage(s.id, 'user', 'should fail');
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('expected addMessage to throw on archived session');
  return 'PASS: archived session locked';
}

// ----- Test 5: Full-text search -----
export async function testSearch() {
  const mgr = new SessionManager();
  const s1 = await mgr.createSession('S1');
  await mgr.addMessage(s1.id, 'user', 'apple banana cherry');
  const s2 = await mgr.createSession('S2');
  await mgr.addMessage(s2.id, 'user', 'apple pie recipe');

  const results = await mgr.search('apple');
  if (results.length !== 2) throw new Error(`expected 2 results for 'apple', got ${results.length}`);

  const banana = await mgr.search('banana');
  if (banana.length !== 1) throw new Error(`expected 1 result for 'banana'`);

  const multi = await mgr.search('apple pie');
  if (multi.length !== 1) throw new Error('multi-term search should rank S2 first');
  if (multi[0]?.sessionId !== s2.id) throw new Error('multi-term should return S2 (higher score)');
  return 'PASS: full-text search';
}

// ----- Test 6: Multi-session switch -----
export async function testMultiSessionSwitch() {
  const mgr = new SessionManager();
  const s1 = await mgr.createSession('S1');
  const s2 = await mgr.createSession('S2');
  if (mgr.getActiveSessionId() !== s2.id) throw new Error('S2 should be active by default');

  await mgr.switchActiveSession(s1.id);
  if (mgr.getActiveSessionId() !== s1.id) throw new Error('switch to S1 failed');
  return 'PASS: multi-session switch';
}

// ----- Test 7: Export/Import single session -----
export async function testExportImport() {
  const mgr1 = new SessionManager();
  const s = await mgr1.createSession('Export Test');
  await mgr1.addMessage(s.id, 'user', 'important data');

  const json = await mgr1.exportSession(s.id);
  const parsed = JSON.parse(json);
  if (parsed.name !== 'Export Test') throw new Error('exported name mismatch');

  // Import into a new manager
  const mgr2 = new SessionManager();
  const imported = await mgr2.importSession(json);
  if (imported.status !== 'active') throw new Error('imported should be active');
  if (imported.messages.length !== 1) throw new Error('imported messages missing');
  return 'PASS: export/import';
}

// ----- Test 8: Export all sessions -----
export async function testExportAll() {
  const mgr = new SessionManager();
  await mgr.createSession('A');
  await mgr.createSession('B');
  const all = await mgr.exportAll();
  const parsed = JSON.parse(all);
  if (parsed.sessions.length !== 2) throw new Error(`expected 2 sessions, got ${parsed.sessions.length}`);
  if (parsed.version !== 1) throw new Error('version missing');
  return 'PASS: export all';
}

// ----- Test 9: Delete session -----
export async function testDeleteSession() {
  const mgr = new SessionManager();
  const s = await mgr.createSession('Delete Test');
  await mgr.deleteSession(s.id);
  const loaded = await mgr.getSession(s.id);
  if (loaded !== null) throw new Error('expected null after delete');
  if (mgr.getActiveSessionId() !== null) throw new Error('deleted session should clear active');
  return 'PASS: delete session';
}

// ----- Test 10: InMemory store with persistent backend hook -----
export async function testPersistentBackendHook() {
  // Simulate persistent backend that records saves
  const saved: string[] = [];
  const fakeBackend: SessionStore = {
    load: async (_id) => null,
    save: async (s) => { saved.push(s.id); },
    delete: async (id) => { saved.push(`DELETE:${id}`); },
    listIds: async () => [],
    search: async () => [],
  };
  const store = new InMemorySessionStore(fakeBackend);
  const mgr = new SessionManager(store);
  const s = await mgr.createSession('Persistence Test');
  if (saved.length !== 1 || saved[0] !== s.id) throw new Error('expected save to propagate to backend');
  return 'PASS: persistent backend hook';
}

// ----- Test 11: Search snippets are truncated -----
export async function testSearchSnippets() {
  const mgr = new SessionManager();
  const s = await mgr.createSession('Snippet Test');
  const longContent = 'unicorn '.repeat(50);
  await mgr.addMessage(s.id, 'user', longContent);
  const results = await mgr.search('unicorn');
  if (results.length !== 1) throw new Error('expected 1 result');
  if (!results[0]?.snippet.endsWith('…')) throw new Error('long snippet should be truncated');
  return 'PASS: search snippets truncated';
}

// ----- Test 12: Invalid import JSON throws -----
export async function testInvalidImport() {
  const mgr = new SessionManager();
  let threw = false;
  try {
    await mgr.importSession('not valid json {');
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('expected invalid JSON to throw');
  return 'PASS: invalid import rejected';
}

// ----- Runner -----
export async function runAllSessionTests(): Promise<{ passed: number; failed: number; results: string[] }> {
  const tests = [
    testCreateSession,
    testLifecycle,
    testAddMessage,
    testArchivedSessionLocked,
    testSearch,
    testMultiSessionSwitch,
    testExportImport,
    testExportAll,
    testDeleteSession,
    testPersistentBackendHook,
    testSearchSnippets,
    testInvalidImport,
  ];
  const results: string[] = [];
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      const r = await t();
      results.push(r);
      passed++;
    } catch (err) {
      results.push(`FAIL: ${t.name} — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }
  return { passed, failed, results };
}
