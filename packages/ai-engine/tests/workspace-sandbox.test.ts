import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureInSandbox } from '../src/tools/workspace-tools.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('workspace sandbox canonical containment', () => {
  it('allows existing and not-yet-created paths inside the workspace', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ghita-workspace-'));
    cleanupPaths.push(workspace);
    fs.mkdirSync(path.join(workspace, 'src'));

    expect(ensureInSandbox('src/index.ts', workspace)).toBe(
      path.join(workspace, 'src', 'index.ts'),
    );
  });

  it('blocks traversal outside the workspace', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ghita-workspace-'));
    cleanupPaths.push(workspace);
    expect(() => ensureInSandbox('../secret.txt', workspace)).toThrow(/outside/i);
  });

  it('blocks a directory symlink or junction that escapes the workspace', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ghita-workspace-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ghita-outside-'));
    cleanupPaths.push(workspace, outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');

    const link = path.join(workspace, 'escape');
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');

    expect(() => ensureInSandbox(path.join('escape', 'secret.txt'), workspace)).toThrow(
      /symbolic link|junction/i,
    );
    expect(() => ensureInSandbox(path.join('escape', 'new.txt'), workspace)).toThrow(
      /symbolic link|junction/i,
    );
  });
});
