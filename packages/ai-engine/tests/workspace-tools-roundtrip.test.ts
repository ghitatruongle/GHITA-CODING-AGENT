// ==============================================================================
// PROOF: AI agentic file editing (Antigravity-style) does real filesystem work
//
// Exercises the built-in workspace tools (write_file / read_file /
// replace_file_content / list_dir / grep_search) that the ReAct agent invokes,
// against a REAL temp workspace — proving the AI can create and edit existing
// files on disk, with sandbox containment and an approval gate.
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuiltInTools, type BuiltInTool } from '../src/tools/index.js';

type GhitaGlobals = {
  ghitaWorkspaceRoot?: string;
  agentPermissionMode?: string;
  approveFileWriteHandler?: (action: string, path: string) => Promise<boolean>;
};
const g = globalThis as unknown as GhitaGlobals;

function tool(tools: BuiltInTool[], name: string): BuiltInTool {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

describe('AI file editing tools (real filesystem)', () => {
  let root: string;
  let tools: BuiltInTool[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ghita-ws-'));
    g.ghitaWorkspaceRoot = root;
    g.agentPermissionMode = 'yolo'; // non-custom → no approval prompt
    delete g.approveFileWriteHandler;
    tools = createBuiltInTools();
  });

  afterEach(() => {
    delete g.ghitaWorkspaceRoot;
    delete g.agentPermissionMode;
    delete g.approveFileWriteHandler;
    rmSync(root, { recursive: true, force: true });
  });

  it('write_file creates a real file on disk', async () => {
    const out = await tool(tools, 'write_file').execute({
      filePath: 'src/hello.ts',
      content: 'export const hello = 1;\n',
    });
    expect(out).toContain('written successfully');
    const abs = join(root, 'src', 'hello.ts');
    expect(existsSync(abs)).toBe(true);
    expect(readFileSync(abs, 'utf8')).toBe('export const hello = 1;\n');
  });

  it('read_file returns real content the AI can inspect', async () => {
    writeFileSync(join(root, 'note.md'), '# Title\nbody line\n');
    const out = await tool(tools, 'read_file').execute({ filePath: 'note.md' });
    expect(out).toContain('# Title');
    expect(out).toContain('body line');
  });

  it('replace_file_content edits an EXISTING file (Antigravity-style)', async () => {
    writeFileSync(join(root, 'app.ts'), 'const port = 3000;\nconst host = "localhost";\n');
    const out = await tool(tools, 'replace_file_content').execute({
      filePath: 'app.ts',
      targetContent: 'const port = 3000;',
      replacementContent: 'const port = 8080;',
    });
    expect(out).toContain('Successfully replaced');
    expect(readFileSync(join(root, 'app.ts'), 'utf8')).toBe(
      'const port = 8080;\nconst host = "localhost";\n',
    );
  });

  it('replace_file_content refuses ambiguous (non-unique) targets', async () => {
    writeFileSync(join(root, 'dup.ts'), 'x = 1;\nx = 1;\n');
    await expect(
      tool(tools, 'replace_file_content').execute({
        filePath: 'dup.ts',
        targetContent: 'x = 1;',
        replacementContent: 'x = 2;',
      }),
    ).rejects.toThrow(/Multiple occurrences/);
  });

  it('grep_search finds text the AI wrote', async () => {
    await tool(tools, 'write_file').execute({ filePath: 'a.ts', content: 'const MAGIC = 42;\n' });
    const out = await tool(tools, 'grep_search').execute({ query: 'MAGIC' });
    expect(out).toContain('a.ts');
  });

  it('list_dir enumerates the workspace', async () => {
    await tool(tools, 'write_file').execute({ filePath: 'one.ts', content: '1' });
    const out = await tool(tools, 'list_dir').execute({});
    expect(out).toContain('one.ts');
  });

  it('blocks writes that escape the workspace sandbox', async () => {
    await expect(
      tool(tools, 'write_file').execute({ filePath: '../escape.ts', content: 'nope' }),
    ).rejects.toThrow(/outside the active workspace sandbox/);
  });

  it('honors the approval gate in custom mode (rejection blocks the write)', async () => {
    g.agentPermissionMode = 'custom';
    g.approveFileWriteHandler = async () => false; // user rejects
    await expect(
      tool(tools, 'write_file').execute({ filePath: 'blocked.ts', content: 'data' }),
    ).rejects.toThrow(/Permission Denied/);
    expect(existsSync(join(root, 'blocked.ts'))).toBe(false);
  });

  it('allows the write when the approval gate accepts', async () => {
    g.agentPermissionMode = 'custom';
    g.approveFileWriteHandler = async () => true; // user approves
    await tool(tools, 'write_file').execute({ filePath: 'ok.ts', content: 'data' });
    expect(existsSync(join(root, 'ok.ts'))).toBe(true);
  });
});
