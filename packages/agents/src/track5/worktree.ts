// Git-worktree manager (orca/superpowers pattern): each agent session runs on
// its own branch + worktree; results merge back on acceptance. Git commands
// are injectable so CI/tests run without a real repo.

export interface GitRunner {
  (repoDir: string, args: string[]): { ok: boolean; stdout: string; stderr: string };
}

export interface WorktreeOptions {
  /** Base branch the worktree starts from (default: current HEAD). */
  base?: string;
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  base: string;
  createdAt: number;
}

import { spawnSync } from 'node:child_process';

const spawn = (repoDir: string, args: string[]) => {
  const res = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' });
  return { ok: res.status === 0, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
};

export class WorktreeManager {
  private readonly worktrees = new Map<string, WorktreeInfo>();

  constructor(private readonly git: GitRunner = spawn) {}

  /** Create an isolated worktree on a new branch (idempotent by name). */
  create(repoDir: string, name: string, options: WorktreeOptions = {}): WorktreeInfo {
    const existing = this.worktrees.get(name);
    if (existing) return existing;

    const branch = `ghita-agent/${name}`;
    const path = `${repoDir}/.ghita/worktrees/${name}`;
    const base = options.base ?? this.currentBranch(repoDir);

    const args = ['worktree', 'add', '-b', branch, path];
    if (base) args.push(base);
    const res = this.git(repoDir, args);
    if (!res.ok) {
      throw new Error(`git worktree add failed: ${res.stderr}`);
    }
    const info: WorktreeInfo = { name, path, branch, base, createdAt: Date.now() };
    this.worktrees.set(name, info);
    return info;
  }

  /** Merge a worktree branch back into its base (fast-forward when possible). */
  merge(
    repoDir: string,
    name: string,
    options: { message?: string } = {},
  ): { ok: boolean; stdout: string; stderr: string } {
    const info = this.worktrees.get(name);
    if (!info) return { ok: false, stdout: '', stderr: `unknown worktree "${name}"` };
    const merged = this.git(repoDir, [
      'merge',
      info.branch,
      '-m',
      options.message ?? `ghita: merge ${name}`,
    ]);
    return merged;
  }

  /** Remove the worktree and its branch (post-merge or on reject). */
  remove(repoDir: string, name: string, options: { force?: boolean } = {}): boolean {
    const info = this.worktrees.get(name);
    if (!info) return false;
    const args = ['worktree', 'remove'];
    if (options.force) args.push('--force');
    args.push(info.path);
    const res = this.git(repoDir, args);
    if (res.ok) {
      this.git(repoDir, ['branch', '-D', info.branch]);
      this.worktrees.delete(name);
    }
    return res.ok;
  }

  list(): WorktreeInfo[] {
    return [...this.worktrees.values()];
  }

  get(name: string): WorktreeInfo | undefined {
    return this.worktrees.get(name);
  }

  private currentBranch(repoDir: string): string {
    const res = this.git(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return res.ok ? res.stdout.trim() : 'main';
  }
}
