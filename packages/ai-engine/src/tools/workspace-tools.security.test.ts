import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureInSandbox } from './workspace-tools.js';

// ==============================================================================
// v1.1.0 Track 11 F1/F2 — regression tests for CR-002 (workspace-tools sandbox)
// ==============================================================================

let root: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ws-sandbox-'));
  outside = mkdtempSync(join(tmpdir(), 'ws-outside-'));
  (globalThis as Record<string, unknown>).ghitaWorkspaceRoot = root;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).ghitaWorkspaceRoot;
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('ensureInSandbox (CR-002 path containment)', () => {
  it('accepts paths inside the workspace', () => {
    mkdirSync(join(root, 'src'));
    const resolved = ensureInSandbox('src/a.ts', root);
    expect(resolved.replaceAll('\\', '/').endsWith('src/a.ts')).toBe(true);
  });

  it('rejects traversal outside the workspace', () => {
    expect(() => ensureInSandbox('../secret.txt', root)).toThrow(/outside the active workspace/);
    expect(() => ensureInSandbox('src/../../etc/passwd', root)).toThrow(
      /outside|Security Exception/,
    );
  });

  it('rejects absolute paths outside', () => {
    const secret = join(outside, 'secret.txt');
    writeFileSync(secret, 'x');
    expect(() => ensureInSandbox(secret, root)).toThrow(/outside|Security Exception/);
  });

  it('rejects symlinks escaping the workspace', () => {
    mkdirSync(join(root, 'link-dir'));
    const escaped = join(outside, 'target.txt');
    writeFileSync(escaped, 'secret');
    symlinkSync(escaped, join(root, 'link-dir', 'evil-link.txt'));
    expect(() => ensureInSandbox('link-dir/evil-link.txt', root)).toThrow(
      /outside|Security Exception/,
    );
  });
});
