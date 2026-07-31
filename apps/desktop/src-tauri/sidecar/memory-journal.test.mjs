import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { containsSensitiveMemory, WorkspaceMemoryJournal } from './memory-journal.mjs';

test('persists workspace-isolated memory with metadata redaction', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ghita-memory-'));
  try {
    const journal = new WorkspaceMemoryJournal(directory);
    await journal.save('C:\\workspace\\one', [
      {
        id: 'mem_1',
        type: 'preference',
        content: 'Use pnpm for this workspace.',
        timestamp: 1,
        metadata: { apiKey: 'private', source: 'user' },
      },
    ]);

    const first = await journal.load('C:\\workspace\\one');
    const second = await journal.load('C:\\workspace\\two');
    assert.equal(first.length, 1);
    assert.equal(first[0].metadata.apiKey, '[REDACTED]');
    assert.deepEqual(second, []);
    assert.equal((await fs.readdir(directory)).length, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('does not persist content that resembles credentials', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ghita-memory-'));
  try {
    const journal = new WorkspaceMemoryJournal(directory);
    assert.equal(containsSensitiveMemory('api_key = super-secret-value'), true);
    assert.equal(containsSensitiveMemory('Use strict TypeScript settings.'), false);

    await journal.save('/workspace', [
      {
        id: 'secret',
        type: 'fact',
        content: 'api_key = super-secret-value',
        timestamp: 1,
      },
      {
        id: 'safe',
        type: 'fact',
        content: 'The project uses TypeScript.',
        timestamp: 2,
      },
      {
        id: 'unsupported',
        type: 'task',
        content: 'This legacy type must not be hydrated.',
        timestamp: 3,
      },
    ]);
    const loaded = await journal.load('/workspace');
    assert.deepEqual(
      loaded.map((entry) => entry.id),
      ['safe'],
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
