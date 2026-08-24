// Runs one prompt across N isolated worktrees in parallel, then compares the
// results. Uses the WorktreeManager for isolation and an injectable agent
// runner (offline tests use a fake).

import type { WorktreeInfo } from './worktree.js';

export interface FanoutAgentRunner {
  (prompt: string, worktree: WorktreeInfo): Promise<{ output: string; summary?: string }>;
}

export interface FanoutConfig {
  /** Number of parallel agents (default 3). */
  count?: number;
  /** Base name prefix for worktrees (default "fanout"). */
  prefix?: string;
}

export interface FanoutResult {
  prompt: string;
  runs: Array<{ worktree: string; output: string; summary?: string }>;
  /** Best run by summary length heuristic (simple comparator). */
  best?: { worktree: string; output: string };
  merged: boolean;
}

export interface FanoutDeps {
  createWorktree: (name: string) => WorktreeInfo;
  runAgent: FanoutAgentRunner;
  mergeWorktree: (name: string) => boolean;
  removeWorktree: (name: string, opts?: { force?: boolean }) => boolean;
}

/** Run one prompt across N isolated worktrees and compare outputs. */
export async function runFanout(
  prompt: string,
  deps: FanoutDeps,
  config: FanoutConfig = {},
): Promise<FanoutResult> {
  const count = Math.max(1, config.count ?? 3);
  const prefix = config.prefix ?? 'fanout';

  const worktrees: WorktreeInfo[] = [];
  for (let i = 0; i < count; i++) {
    worktrees.push(deps.createWorktree(`${prefix}-${i + 1}`));
  }

  const runs = await Promise.all(
    worktrees.map(async (wt) => {
      const { output, summary } = await deps.runAgent(prompt, wt);
      return { worktree: wt.name, output, summary };
    }),
  );

  // Simple comparison: longest non-empty output wins (pluggable later).
  let best: FanoutResult['best'];
  let bestLen = -1;
  for (const run of runs) {
    const len = run.output.trim().length;
    if (len > bestLen) {
      bestLen = len;
      best = { worktree: run.worktree, output: run.output };
    }
  }

  // Merge the best worktree back (accept path).
  const merged = best ? deps.mergeWorktree(best.worktree) : false;
  for (const run of runs) {
    if (run.worktree !== best?.worktree) deps.removeWorktree(run.worktree, { force: true });
  }

  return { prompt, runs, best, merged };
}
