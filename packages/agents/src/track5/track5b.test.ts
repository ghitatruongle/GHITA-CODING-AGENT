import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorktreeManager, type WorktreeInfo } from './worktree.js';
import { runFanout } from './fanout.js';
import {
  MemoryFlowStateStore,
  SqliteFlowStateStore,
  runFlowNodeWithResume,
  withHumanFeedback,
} from './flow-persist.js';
import { RequestHumanInputManager } from './hitl.js';

describe('WorktreeManager', () => {
  function fakeGit(worktrees: Map<string, WorktreeInfo>) {
    return (_repo: string, args: string[]) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('worktree add')) {
        const branch = args[args.indexOf('-b') + 1] ?? '';
        const path = args[args.indexOf('-b') + 2] ?? '';
        worktrees.set(branch.replace('ghita-agent/', ''), {
          name: branch.replace('ghita-agent/', ''),
          path,
          branch,
          base: 'main',
          createdAt: Date.now(),
        });
        return { ok: true, stdout: '', stderr: '' };
      }
      if (cmd.includes('rev-parse')) return { ok: true, stdout: 'main\n', stderr: '' };
      if (cmd.startsWith('worktree remove')) {
        const path = args[args.length - 1] ?? '';
        const entry = [...worktrees.values()].find((w) => w.path === path);
        if (entry) worktrees.delete(entry.name);
        return { ok: true, stdout: '', stderr: '' };
      }
      if (cmd.startsWith('branch -D')) return { ok: true, stdout: '', stderr: '' };
      if (cmd.startsWith('merge')) return { ok: true, stdout: 'merged', stderr: '' };
      return { ok: true, stdout: '', stderr: '' };
    };
  }

  it('creates, merges and removes worktrees', () => {
    const worktrees = new Map<string, WorktreeInfo>();
    const manager = new WorktreeManager(fakeGit(worktrees));
    const info = manager.create('/repo', 'task-1');
    expect(info.branch).toBe('ghita-agent/task-1');
    expect(manager.get('task-1')?.path).toBe('/repo/.ghita/worktrees/task-1');

    expect(manager.merge('/repo', 'task-1').ok).toBe(true);
    expect(manager.remove('/repo', 'task-1')).toBe(true);
    expect(worktrees.has('task-1')).toBe(false);
  });
});

describe('runFanout', () => {
  it('runs one prompt across N worktrees and merges the best', async () => {
    const created: string[] = [];
    const removed: string[] = [];
    let mergeName: string | undefined;
    const result = await runFanout(
      'fix the bug',
      {
        createWorktree: (name) => {
          created.push(name);
          return {
            name,
            path: `/wt/${name}`,
            branch: `ghita-agent/${name}`,
            base: 'main',
            createdAt: 0,
          };
        },
        runAgent: async (prompt, wt) => ({
          output: `${prompt} → output-${wt.name}`,
        }),
        mergeWorktree: (name) => {
          mergeName = name;
          return true;
        },
        removeWorktree: (name) => {
          removed.push(name);
          return true;
        },
      },
      { count: 3 },
    );
    expect(created).toHaveLength(3);
    expect(result.runs).toHaveLength(3);
    expect(result.merged).toBe(true);
    // Best = longest output (fanout-3's output is longest).
    expect(mergeName).toBe('fanout-3');
    expect(removed).toEqual(['fanout-1', 'fanout-2']);
  });
});

describe('flow persistence', () => {
  it('memory store resumes idempotently', async () => {
    const store = new MemoryFlowStateStore();
    let executions = 0;
    const state = await runFlowNodeWithResume(store, 'node-a', async () => {
      executions += 1;
      return { ok: true };
    });
    expect(state.status).toBe('completed');
    const replay = await runFlowNodeWithResume(store, 'node-a', async () => {
      executions += 1;
      return { ok: true };
    });
    expect(replay.status).toBe('completed');
    expect(executions).toBe(1); // idempotent — not re-run
  });

  it('sqlite store survives and restores', () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-sql-'));
    const store = new SqliteFlowStateStore(join(dir, 'flow.db'));
    store.save({ nodeId: 'n1', status: 'completed', attempts: 1, output: { x: 1 }, updatedAt: 10 });
    expect(store.get('n1')?.output).toEqual({ x: 1 });
    expect(store.remove('n1')).toBe(true);
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('withHumanFeedback blocks until answered', async () => {
    const manager = new RequestHumanInputManager({ timeoutMs: 0 });
    const promise = withHumanFeedback(manager, 'node-x', 'Approve?', { options: ['yes'] });
    const pending = manager.pending()[0];
    expect(pending).toBeDefined();
    setTimeout(() => pending?.id && manager.answer(pending.id, 'yes'), 10);
    const result = await promise;
    expect(result.answer).toBe('yes');
    expect(result.cancelled).toBe(false);
  });
});
