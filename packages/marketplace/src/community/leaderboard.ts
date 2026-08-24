import type { Contributor, ForumReply, ForumThread, BugReport, FeatureRequest } from './types.js';

/** Weights per activity */
const WEIGHTS = {
  thread: 5,
  reply: 1,
  acceptedAnswer: 10,
  bugReport: 2,
  featureRequest: 1,
};

/**
 * Builds and ranks a contributor leaderboard from raw community data.
 */
export class Leaderboard {
  private contributors = new Map<string, Contributor>();

  /**
   * Ingest raw counts for a single user.
   */
  record(opts: {
    userId: string;
    name: string;
    avatar?: string;
    threads?: number;
    replies?: number;
    acceptedAnswers?: number;
    bugReports?: number;
    featureRequests?: number;
    lastActiveAt?: number;
  }): Contributor {
    const cur = this.contributors.get(opts.userId);
    const c: Contributor = cur ?? {
      userId: opts.userId,
      name: opts.name,
      avatar: opts.avatar,
      score: 0,
      counts: { threads: 0, replies: 0, bugReports: 0, featureRequests: 0, acceptedAnswers: 0 },
      lastActiveAt: 0,
    };
    if (opts.avatar) c.avatar = opts.avatar;
    c.name = opts.name;
    c.counts.threads += opts.threads ?? 0;
    c.counts.replies += opts.replies ?? 0;
    c.counts.acceptedAnswers += opts.acceptedAnswers ?? 0;
    c.counts.bugReports += opts.bugReports ?? 0;
    c.counts.featureRequests += opts.featureRequests ?? 0;
    c.lastActiveAt = Math.max(c.lastActiveAt, opts.lastActiveAt ?? 0);
    c.score = this.computeScore(c.counts);
    this.contributors.set(c.userId, c);
    return c;
  }

  /**
   * Compute score from counts.
   */
  private computeScore(c: Contributor['counts']): number {
    return (
      c.threads * WEIGHTS.thread +
      c.replies * WEIGHTS.reply +
      c.acceptedAnswers * WEIGHTS.acceptedAnswer +
      c.bugReports * WEIGHTS.bugReport +
      c.featureRequests * WEIGHTS.featureRequest
    );
  }

  /**
   * Top N contributors, highest score first.
   */
  top(n: number): Contributor[] {
    return Array.from(this.contributors.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }

  /**
   * Get a specific contributor.
   */
  get(userId: string): Contributor | undefined {
    return this.contributors.get(userId);
  }

  /**
   * Build a snapshot by walking forum/threads/replies/bug-reports/feature-requests in bulk.
   * Helper to avoid the caller having to aggregate themselves.
   */
  ingest(
    threads: ForumThread[],
    replies: ForumReply[],
    bugs: BugReport[],
    features: FeatureRequest[],
  ): void {
    const userThreads = new Map<string, number>();
    const userReplies = new Map<string, number>();
    const userAccepted = new Map<string, number>();
    const userBugs = new Map<string, number>();
    const userFeats = new Map<string, number>();
    const names = new Map<string, string>();

    for (const t of threads) {
      userThreads.set(t.authorId, (userThreads.get(t.authorId) ?? 0) + 1);
      names.set(t.authorId, names.get(t.authorId) ?? `user-${t.authorId.slice(-4)}`);
    }
    for (const r of replies) {
      userReplies.set(r.authorId, (userReplies.get(r.authorId) ?? 0) + 1);
      if (r.accepted) userAccepted.set(r.authorId, (userAccepted.get(r.authorId) ?? 0) + 1);
      names.set(r.authorId, names.get(r.authorId) ?? `user-${r.authorId.slice(-4)}`);
    }
    for (const b of bugs) {
      userBugs.set(b.reporterId, (userBugs.get(b.reporterId) ?? 0) + 1);
      names.set(b.reporterId, names.get(b.reporterId) ?? `user-${b.reporterId.slice(-4)}`);
    }
    for (const f of features) {
      userFeats.set(f.authorId, (userFeats.get(f.authorId) ?? 0) + 1);
      names.set(f.authorId, names.get(f.authorId) ?? `user-${f.authorId.slice(-4)}`);
    }

    const allUsers = new Set<string>([
      ...userThreads.keys(),
      ...userReplies.keys(),
      ...userBugs.keys(),
      ...userFeats.keys(),
    ]);
    for (const u of allUsers) {
      this.record({
        userId: u,
        name: names.get(u) ?? u,
        threads: userThreads.get(u) ?? 0,
        replies: userReplies.get(u) ?? 0,
        acceptedAnswers: userAccepted.get(u) ?? 0,
        bugReports: userBugs.get(u) ?? 0,
        featureRequests: userFeats.get(u) ?? 0,
        lastActiveAt: Date.now(),
      });
    }
  }

  /** Static score constants exposed for testing */
  static get weights() {
    return WEIGHTS;
  }
}
