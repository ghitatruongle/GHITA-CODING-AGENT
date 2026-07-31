import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AgentRunJournal, createRunId } from './run-journal.mjs';

async function withJournal(callback, options) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ghita-run-journal-'));
  try {
    await callback(new AgentRunJournal(directory, options), directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function checkpoint(runId, overrides = {}) {
  return {
    version: 1,
    runId,
    agentId: 'agent_1',
    agentName: 'GHITA-ReAct-Local',
    userMessage: 'Inspect the project',
    status: 'running',
    maxIterations: 10,
    nextIteration: 1,
    messages: [
      {
        id: 'message_1',
        role: 'user',
        content: 'hello',
        timestamp: 1,
        metadata: { apiKey: 'must-not-survive' },
      },
    ],
    steps: [],
    pendingActions: [
      {
        tool: 'web_fetch',
        toolCallId: 'call_1',
        input: {
          url: 'https://example.test',
          authorization: 'Bearer private',
        },
      },
    ],
    updatedAt: Date.now(),
    ...overrides,
  };
}

test('atomically saves, loads, lists, and redacts run checkpoints', async () => {
  await withJournal(async (journal, directory) => {
    const runId = createRunId(1_700_000_000_000);
    await journal.save(checkpoint(runId));

    const loaded = await journal.load(runId);
    assert.equal(loaded.messages[0].metadata.apiKey, '[REDACTED]');
    assert.equal(loaded.pendingActions[0].input.authorization, '[REDACTED]');

    const list = await journal.list();
    assert.equal(list.length, 1);
    assert.deepEqual(list[0], {
      runId,
      status: 'running',
      task: 'Inspect the project',
      agentName: 'GHITA-ReAct-Local',
      nextIteration: 1,
      stepsCount: 0,
      pendingActionsCount: 1,
      outputPreview: '',
      error: '',
      updatedAt: loaded.updatedAt,
    });

    const names = await fs.readdir(directory);
    assert.deepEqual(names, [`${runId}.json`]);
    const raw = await fs.readFile(path.join(directory, names[0]), 'utf8');
    assert.equal(raw.includes('must-not-survive'), false);
    assert.equal(raw.includes('Bearer private'), false);
  });
});

test('rejects traversal and malformed run identifiers', async () => {
  await withJournal(async (journal) => {
    await assert.rejects(() => journal.load('../escape'), /Invalid agent run ID/);
    await assert.rejects(
      () => journal.save(checkpoint('bad/run')),
      /Invalid agent run ID/,
    );
  });
});

test('updates status and prunes the oldest checkpoints', async () => {
  await withJournal(
    async (journal) => {
      await journal.save(checkpoint('run_first', { updatedAt: 1 }));
      await journal.save(checkpoint('run_second', { updatedAt: 2 }));
      await journal.save(checkpoint('run_third', { updatedAt: 3 }));

      const runs = await journal.list();
      assert.deepEqual(
        runs.map((run) => run.runId),
        ['run_third', 'run_second'],
      );

      await journal.markStatus('run_third', 'interrupted', 'application stopped');
      const updated = await journal.load('run_third');
      assert.equal(updated.status, 'interrupted');
      assert.equal(updated.error, 'application stopped');
    },
    { maxRuns: 2 },
  );
});

test('accepts exhausted runs so they remain resumable', async () => {
  await withJournal(async (journal) => {
    await journal.save(checkpoint('run_exhausted', { status: 'exhausted' }));
    const loaded = await journal.load('run_exhausted');
    assert.equal(loaded.status, 'exhausted');
  });
});
