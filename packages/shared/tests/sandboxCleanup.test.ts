import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cleanOrphanedSandboxFiles } from '../src/sandboxCleanup.js';

describe('Sandbox Orphan Cleanup Utility', () => {
  const tempDir = path.resolve(process.cwd(), 'packages/shared/tests/temp-cleanup');
  const sandboxDir = path.join(tempDir, 'sandbox');
  const otherDir = path.join(tempDir, 'other');

  beforeEach(() => {
    // Clean up and recreate test directories
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(sandboxDir, { recursive: true });
    fs.mkdirSync(otherDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should clean up files older than maxAgeMs based on naming and location patterns', async () => {
    const now = Date.now();
    const threeHoursAgo = now - 3 * 60 * 60 * 1000;
    const halfHourAgo = now - 30 * 60 * 1000;

    // 1. In sandbox subfolder (any file matching the age should be deleted)
    const oldFileInSandbox = path.join(sandboxDir, 'old-file.txt');
    const newFileInSandbox = path.join(sandboxDir, 'new-file.txt');

    fs.writeFileSync(oldFileInSandbox, 'hello old', 'utf-8');
    fs.utimesSync(oldFileInSandbox, new Date(threeHoursAgo), new Date(threeHoursAgo));

    fs.writeFileSync(newFileInSandbox, 'hello new', 'utf-8');
    fs.utimesSync(newFileInSandbox, new Date(halfHourAgo), new Date(halfHourAgo));

    // 2. In other folder (only ghita- prefixed files matching the age should be deleted)
    const oldGhitaFile = path.join(otherDir, 'ghita-old.txt');
    const newGhitaFile = path.join(otherDir, 'ghita-new.txt');
    const oldRegularFile = path.join(otherDir, 'regular-old.txt');

    fs.writeFileSync(oldGhitaFile, 'ghita old', 'utf-8');
    fs.utimesSync(oldGhitaFile, new Date(threeHoursAgo), new Date(threeHoursAgo));

    fs.writeFileSync(newGhitaFile, 'ghita new', 'utf-8');
    fs.utimesSync(newGhitaFile, new Date(halfHourAgo), new Date(halfHourAgo));

    fs.writeFileSync(oldRegularFile, 'regular old', 'utf-8');
    fs.utimesSync(oldRegularFile, new Date(threeHoursAgo), new Date(threeHoursAgo));

    // Run clean up
    const maxAgeMs = 2 * 60 * 60 * 1000; // 2 hours
    const result = await cleanOrphanedSandboxFiles([sandboxDir, otherDir], maxAgeMs, true);

    // Verify cleanup results
    expect(result.deletedCount).toBe(2); // oldFileInSandbox, oldGhitaFile
    expect(result.spaceReclaimedBytes).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);

    // Verify filesystem state
    expect(fs.existsSync(oldFileInSandbox)).toBe(false);
    expect(fs.existsSync(newFileInSandbox)).toBe(true);

    expect(fs.existsSync(oldGhitaFile)).toBe(false);
    expect(fs.existsSync(newGhitaFile)).toBe(true);
    expect(fs.existsSync(oldRegularFile)).toBe(true); // Should NOT be deleted (doesn't start with ghita- and not in sandbox folder)
  });

  it('should clean up subdirectories recursively', async () => {
    const now = Date.now();
    const threeHoursAgo = now - 3 * 60 * 60 * 1000;

    // Create an old directory in sandbox
    const oldSubDir = path.join(sandboxDir, 'old-dir');
    fs.mkdirSync(oldSubDir, { recursive: true });

    const fileInSubDir = path.join(oldSubDir, 'some-file.txt');
    fs.writeFileSync(fileInSubDir, 'inner file content', 'utf-8');

    // Update mtimes of directory and inner file to be old
    fs.utimesSync(fileInSubDir, new Date(threeHoursAgo), new Date(threeHoursAgo));
    fs.utimesSync(oldSubDir, new Date(threeHoursAgo), new Date(threeHoursAgo));

    const maxAgeMs = 2 * 60 * 60 * 1000;
    const result = await cleanOrphanedSandboxFiles([sandboxDir], maxAgeMs, true);

    expect(result.deletedCount).toBe(1);
    expect(result.spaceReclaimedBytes).toBe(Buffer.byteLength('inner file content'));
    expect(fs.existsSync(oldSubDir)).toBe(false);
  });
});
