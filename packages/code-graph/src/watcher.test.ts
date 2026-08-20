// ==============================================================================
// Auto-Sync Watcher Unit Tests (Track 3.3)
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CodeKnowledgeGraph } from './index.js';
import { CodeGraphWatcher } from './watcher.js';

describe('CodeGraphWatcher', () => {
  let tmpDir: string;
  let kg: CodeKnowledgeGraph;
  let watcher: CodeGraphWatcher;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghita-watcher-test-'));
    kg = new CodeKnowledgeGraph();
    watcher = new CodeGraphWatcher(kg, { debounceMs: 50 });
  });

  afterEach(() => {
    watcher.stop();
    kg.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts and stops watching without errors', () => {
    watcher.start(tmpDir);
    expect(watcher.getStats().isWatching).toBe(true);
    watcher.stop();
    expect(watcher.getStats().isWatching).toBe(false);
  });

  it('detects file creation and updates graph within <2s', async () => {
    watcher.start(tmpDir);

    const testFile = path.join(tmpDir, 'service.ts');
    const content = 'export function calculateMetrics(a: number): number { return a * 2; }';

    const syncPromise = new Promise<void>((resolve) => {
      watcher.once('sync-complete', () => resolve());
    });

    fs.writeFileSync(testFile, content, 'utf-8');

    // Wait for sync to complete via debounce
    await syncPromise;

    const stats = kg.stats();
    expect(stats.files).toBe(1);
    expect(stats.nodes).toBeGreaterThan(0);

    const node = kg.getNode(`${path.resolve(testFile)}::calculateMetrics`);
    expect(node).toBeDefined();
    expect(node?.name).toBe('calculateMetrics');
  });

  it('batches multiple rapid edits into a single sync pass', async () => {
    watcher.start(tmpDir);

    const syncPromise = new Promise<void>((resolve) => {
      watcher.once('sync-complete', () => resolve());
    });

    // Write 3 files rapidly within the 50ms debounce window
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'export const a = 1;', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'export const b = 2;', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'c.ts'), 'export const c = 3;', 'utf-8');

    await syncPromise;

    expect(watcher.getStats().filesIndexed).toBeGreaterThanOrEqual(1);
    expect(kg.stats().files).toBe(3);
  });

  it('handles git hook events', () => {
    watcher.start(tmpDir);
    let gitEventReceived = false;
    watcher.on('git-hook', (evt) => {
      if (evt.hookName === 'post-checkout') gitEventReceived = true;
    });

    watcher.handleGitHook('post-checkout', 'feature-branch');
    expect(gitEventReceived).toBe(true);
  });

  it('pauses and resumes watching correctly', async () => {
    watcher.start(tmpDir);
    watcher.pause();
    expect(watcher.getStats().isPaused).toBe(true);

    // Changes while paused are ignored
    fs.writeFileSync(path.join(tmpDir, 'ignored.ts'), 'export const ignored = true;', 'utf-8');
    await new Promise((r) => setTimeout(r, 100));
    expect(kg.stats().files).toBe(0);

    watcher.resume();
    expect(watcher.getStats().isPaused).toBe(false);
  });
});
