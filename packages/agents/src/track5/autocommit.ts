// ==============================================================================
// GHITA CODING AGENT - Agents v1.1.0 Track 5 P59: git-aware checkpoints
// ==============================================================================
// Auto-commit policy (ask | always | never) applied at checkpoint time —
// mirrors aider's git integration while preserving the existing
// `.ghita/checkpoints` flow.
// ==============================================================================

export type AutoCommitMode = 'ask' | 'always' | 'never';

export interface GitAutoCommitPolicyOptions {
  mode?: AutoCommitMode;
  /** Skip when the working tree is clean. */
  skipWhenClean?: boolean;
}

export interface GitCommitResult {
  committed: boolean;
  reason: string;
  commitSha?: string;
}

export interface GitOps {
  isClean: () => boolean;
  commitAll: (message: string) => { ok: boolean; sha?: string; error?: string };
}

export class GitAutoCommitPolicy {
  readonly mode: AutoCommitMode;
  private readonly skipWhenClean: boolean;

  constructor(options: GitAutoCommitPolicyOptions = {}) {
    this.mode = options.mode ?? 'never';
    this.skipWhenClean = options.skipWhenClean ?? true;
  }

  /** Decide whether to commit at a checkpoint (ask → caller prompts user). */
  decide(): { commit: boolean; promptUser: boolean; reason: string } {
    switch (this.mode) {
      case 'always':
        return { commit: true, promptUser: false, reason: 'auto-commit mode: always' };
      case 'ask':
        return { commit: false, promptUser: true, reason: 'auto-commit mode: ask' };
      case 'never':
        return { commit: false, promptUser: false, reason: 'auto-commit mode: never' };
    }
  }

  /** Apply the policy to a checkpoint: commit when permitted. */
  apply(git: GitOps, checkpointLabel: string): GitCommitResult {
    const decision = this.decide();
    if (decision.promptUser) {
      return { committed: false, reason: 'waiting for user decision (ask mode)' };
    }
    if (!decision.commit) {
      return { committed: false, reason: decision.reason };
    }
    if (this.skipWhenClean && git.isClean()) {
      return { committed: false, reason: 'working tree clean — nothing to commit' };
    }
    const result = git.commitAll(`ghita(checkpoint): ${checkpointLabel}`);
    if (!result.ok) {
      return { committed: false, reason: result.error ?? 'commit failed' };
    }
    return { committed: true, reason: 'committed', commitSha: result.sha };
  }
}

/** Commit helper backed by git commands (injectable for tests). */
export function createGitOps(
  repoDir: string,
  git: (repoDir: string, args: string[]) => { ok: boolean; stdout: string; stderr: string },
): GitOps {
  return {
    isClean: () => {
      const res = git(repoDir, ['status', '--porcelain']);
      return res.ok && res.stdout.trim() === '';
    },
    commitAll: (message) => {
      const add = git(repoDir, ['add', '-A']);
      if (!add.ok) return { ok: false, error: add.stderr };
      const commit = git(repoDir, ['commit', '-m', message]);
      if (!commit.ok) {
        // Empty commits are OK when there is nothing to commit.
        if (commit.stderr.includes('nothing to commit')) return { ok: true };
        return { ok: false, error: commit.stderr };
      }
      const shaRes = git(repoDir, ['rev-parse', 'HEAD']);
      return { ok: true, sha: shaRes.ok ? shaRes.stdout.trim() : undefined };
    },
  };
}
