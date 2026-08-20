// ==============================================================================
// Content-Addressed Index & PauseToken Unit Tests (Track 3.2)
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContentAddressedIndex } from './content-index.js';
import { PauseToken } from './pause-token.js';
import { SQLiteGraphStore } from './store.js';

describe('PauseToken', () => {
  it('controls cooperative pause and resume', async () => {
    const token = new PauseToken();
    expect(token.isPaused).toBe(false);
    expect(token.isCancelled).toBe(false);

    token.pause();
    expect(token.isPaused).toBe(true);

    let resumed = false;
    const waitPromise = token.waitIfPaused().then(() => {
      resumed = true;
    });

    expect(resumed).toBe(false);
    token.resume();
    await waitPromise;
    expect(resumed).toBe(true);
    expect(token.isPaused).toBe(false);
  });

  it('handles cancellation and throws error', async () => {
    const token = new PauseToken();
    token.cancel();
    expect(token.isCancelled).toBe(true);

    await expect(token.waitIfPaused()).rejects.toThrow('cancelled by PauseToken');
    expect(() => token.throwIfCancelled()).toThrow('cancelled by PauseToken');
  });

  it('unblocks paused wait on cancel', async () => {
    const token = new PauseToken();
    token.pause();

    const waitPromise = token.waitIfPaused();
    token.cancel();

    await expect(waitPromise).rejects.toThrow('cancelled by PauseToken');
  });
});

describe('ContentAddressedIndex', () => {
  let tmpDir: string;
  let dbPath: string;
  let store: SQLiteGraphStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghita-content-index-test-'));
    dbPath = path.join(tmpDir, 'test-graph.db');
    store = new SQLiteGraphStore(dbPath);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('computes AST and achieves cache hit for identical content', async () => {
    const index = new ContentAddressedIndex({ store });
    const filePath = path.join(tmpDir, 'service.ts');
    const content = `
      export function fetchUser(id: string): string {
        return "user_" + id;
      }
    `;
    fs.writeFileSync(filePath, content, 'utf-8');

    // 1st compute -> miss
    const res1 = await index.compute(filePath, { content });
    expect(res1.nodes.length).toBeGreaterThan(0);
    const stats1 = index.getStats();
    expect(stats1.misses).toBe(1);
    expect(stats1.hits).toBe(0);

    // 2nd compute -> hit
    const res2 = await index.compute(filePath, { content });
    expect(res2.nodes.length).toBe(res1.nodes.length);
    const stats2 = index.getStats();
    expect(stats2.misses).toBe(1);
    expect(stats2.hits).toBe(1);
    expect(stats2.hitRate).toBe(50);
  });

  it('achieves >=90% cache hit on simulated branch checkout', async () => {
    const index = new ContentAddressedIndex({ store });
    const totalFiles = 20;
    const filePaths: string[] = [];

    // Create 20 test files on "main"
    for (let i = 0; i < totalFiles; i++) {
      const p = path.join(tmpDir, `file_${i}.ts`);
      const c = `export const value_${i} = ${i}; export function getVal_${i}() { return value_${i}; }`;
      fs.writeFileSync(p, c, 'utf-8');
      filePaths.push(p);
      await index.compute(p);
      index.addTag(p, 'branch:main');
    }

    expect(index.getStats().misses).toBe(20);
    expect(index.getStats().hits).toBe(0);

    // Reset stats to measure branch switch
    index.resetStats();

    // Simulate checkout branch: 18 files identical (90%), 2 files modified (10%)
    for (let i = 0; i < totalFiles; i++) {
      const p = filePaths[i];
      if (i >= 18) {
        // modified on new branch
        const modifiedContent = `export const value_${i} = ${i * 100}; // changed`;
        fs.writeFileSync(p, modifiedContent, 'utf-8');
      }
      await index.compute(p);
      index.addTag(p, 'branch:feature-x');
    }

    const branchStats = index.getStats();
    expect(branchStats.hits).toBe(18);
    expect(branchStats.misses).toBe(2);
    expect(branchStats.hitRate).toBeGreaterThanOrEqual(90);

    // Verify tag queries
    const mainFiles = index.getFilesByTag('branch:main');
    expect(mainFiles).toHaveLength(20);
    const featureFiles = index.getFilesByTag('branch:feature-x');
    expect(featureFiles).toHaveLength(20);
  });

  it('supports delete, removeTag, and tag cleanup', async () => {
    const index = new ContentAddressedIndex({ store });
    const filePath = path.join(tmpDir, 'temp.ts');
    fs.writeFileSync(filePath, 'export const x = 1;', 'utf-8');

    await index.compute(filePath);
    index.addTag(filePath, 'tag:v1');
    index.addTag(filePath, 'tag:release');

    expect(index.getTags(filePath)).toEqual(expect.arrayContaining(['tag:v1', 'tag:release']));
    expect(index.getFilesByTag('tag:v1')).toContain(path.resolve(filePath));

    // Remove single tag
    index.removeTag(filePath, 'tag:v1');
    expect(index.getTags(filePath)).toEqual(['tag:release']);

    // Delete file
    index.delete(filePath);
    expect(index.getTags(filePath)).toEqual([]);
    expect(index.getFilesByTag('tag:release')).not.toContain(path.resolve(filePath));
  });

  it('respects PauseToken during indexing computation', async () => {
    const index = new ContentAddressedIndex();
    const token = new PauseToken();
    const filePath = path.join(tmpDir, 'pause_test.ts');
    fs.writeFileSync(filePath, 'export const a = 100;', 'utf-8');

    token.pause();
    let finished = false;
    const p = index.compute(filePath, { pauseToken: token }).then((res) => {
      finished = true;
      return res;
    });

    // Verify it is paused
    expect(finished).toBe(false);
    token.resume();

    const res = await p;
    expect(finished).toBe(true);
    expect(res.nodes.length).toBeGreaterThan(0);
  });
});
