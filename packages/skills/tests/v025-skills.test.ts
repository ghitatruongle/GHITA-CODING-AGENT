// v0.2.5 Skills Modules Unit Tests

import { describe, it, expect } from 'vitest';
import { PTYSessionPool } from '../src/terminal/pty-pool.js';
import { ASTStructuralEditor } from '../src/engineering/ast-editor.js';
import { OpenClawTriggerEngine } from '../src/openclaw/trigger-engine.js';

describe('v0.2.5 Skills & Terminal Engine', () => {
  it('should manage long-running PTY terminal sessions and detect crashes', () => {
    const pool = new PTYSessionPool();
    const session = pool.createSession('pty-1', 'Dev Server', 'npm run dev', '/workspace');

    expect(session.status).toBe('running');
    pool.appendLog('pty-1', '[Server] Starting on port 3000...');
    expect(pool.getSession('pty-1')?.status).toBe('running');

    pool.appendLog('pty-1', 'SyntaxError: Unexpected token');
    expect(pool.getSession('pty-1')?.status).toBe('crashed');
  });

  it('should apply structural edit chunks using ASTStructuralEditor', () => {
    const code = `function hello() {\n  console.log("old");\n}`;
    const result = ASTStructuralEditor.applyEditChunks(code, [
      {
        startLine: 2,
        endLine: 2,
        targetContent: 'console.log("old");',
        replacementContent: 'console.log("new");',
      },
    ]);

    expect(result.appliedCount).toBe(1);
    expect(result.updatedContent).toContain('console.log("new");');
  });

  it('should trigger events in OpenClawTriggerEngine', () => {
    const triggerEngine = new OpenClawTriggerEngine();
    triggerEngine.registerTrigger({
      id: 'trig-1',
      eventType: 'file_saved',
      pattern: '.ts',
      skillId: 'code.lint',
      enabled: true,
    });

    const matched = triggerEngine.evaluateEvent('file_saved', 'src/index.ts');
    expect(matched).toHaveLength(1);
    expect(matched[0]?.skillId).toBe('code.lint');
  });
});
