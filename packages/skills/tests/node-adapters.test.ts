import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNodeSkillRegistry } from '../src/node.js';
import { createDefaultSkillRegistry, type SkillRuntimeAdapters } from '../src/index.js';

const tempRoots: string[] = [];

async function createTempWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ghita-skills-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Node skill adapters', () => {
  it('uses defaultCwd as the workspace root for file skills', async () => {
    const root = await createTempWorkspace();
    await writeFile(join(root, 'README.md'), 'workspace read ok', 'utf8');

    const registry = createNodeSkillRegistry({ defaultCwd: root });
    const result = await registry.run('file.read', { input: { path: 'README.md' } });

    expect(result.success).toBe(true);
    expect(result.output).toBe('workspace read ok');
  });

  it('rejects file paths outside the workspace root', async () => {
    const root = await createTempWorkspace();
    const registry = createNodeSkillRegistry({ defaultCwd: root });

    const result = await registry.run('file.read', { input: { path: '../outside.txt' } });

    expect(result.success).toBe(false);
    expect(result.error).toContain('outside the workspace');
  });
});

describe('Built-in terminal skill commands', () => {
  it('builds a safe compress.zip command for the active platform', async () => {
    let command = '';
    const adapters: SkillRuntimeAdapters = {
      terminal: {
        runCommand: async (cmd) => {
          command = cmd;
          return { exitCode: 0, stdout: '', stderr: '', duration: 1 };
        },
      },
    };

    const registry = createDefaultSkillRegistry(adapters);
    registry.setEnabled('compress.zip', true);
    const result = await registry.run('compress.zip', {
      input: { source: 'README.md', output: 'tmp/test-archive.zip' },
    });

    expect(result.success).toBe(true);
    if (process.platform === 'win32') {
      expect(command).toContain('Compress-Archive');
      expect(command).toContain("-LiteralPath 'README.md'");
      expect(command).toContain("-DestinationPath 'tmp/test-archive.zip'");
      expect(command).toContain('-Force');
    } else {
      expect(command).toBe("tar -czf 'tmp/test-archive.zip' 'README.md'");
    }
  });
});
