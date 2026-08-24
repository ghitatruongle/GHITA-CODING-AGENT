import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EvalRun } from './types.js';

export interface LongitudinalOptions {
  /** Path to the SQLite database file (e.g. `.ghita/evals/history.db`). */
  dbPath: string;
}

export interface DeltaRow {
  suite: string;
  baselineVersion: string;
  candidateVersion: string;
  baselineScore: number;
  candidateScore: number;
  delta: number;
}

/** Persist per-version eval history with per-run evidence summary. */
export class LongitudinalStore {
  private readonly db: Database.Database;

  constructor(options: LongitudinalOptions) {
    mkdirSync(dirname(options.dbPath), { recursive: true });
    this.db = new Database(options.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS eval_runs (
        run_id TEXT PRIMARY KEY,
        suite TEXT NOT NULL,
        task_id TEXT NOT NULL,
        version TEXT NOT NULL,
        status TEXT NOT NULL,
        score INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        duration_ms INTEGER,
        trajectory_fingerprint TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_eval_runs_version ON eval_runs(version);
      CREATE INDEX IF NOT EXISTS idx_eval_runs_suite ON eval_runs(suite);
    `);
  }

  /** Store one run. */
  insertRun(run: EvalRun): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO eval_runs
           (run_id, suite, task_id, version, status, score, started_at, duration_ms, trajectory_fingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run.runId,
        run.suite,
        run.task.id,
        run.version,
        run.status,
        run.score,
        run.startedAt,
        run.durationMs,
        run.trajectoryFingerprint,
      );
  }

  /** Latest stored version for a suite (or null). */
  latestVersion(suite: string): string | null {
    const row = this.db
      .prepare(`SELECT version FROM eval_runs WHERE suite = ? ORDER BY started_at DESC LIMIT 1`)
      .get(suite) as { version: string } | undefined;
    return row?.version ?? null;
  }

  /** Aggregate score for a suite/version. */
  averageScore(suite: string, version: string): number | null {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as n, AVG(score) as avg FROM eval_runs WHERE suite = ? AND version = ?`,
      )
      .get(suite, version) as { n: number; avg: number | null };
    return row.n > 0 ? Math.round(row.avg ?? 0) : null;
  }

  /** Trend of average score across stored versions (ordered by time). */
  trend(suite: string, limit = 8): Array<{ version: string; score: number }> {
    const rows = this.db
      .prepare(
        `SELECT version, AVG(score) as avg FROM eval_runs WHERE suite = ?
         GROUP BY version ORDER BY MAX(started_at) ASC LIMIT ?`,
      )
      .all(suite, limit) as Array<{ version: string; avg: number }>;
    return rows.map((r) => ({ version: r.version, score: Math.round(r.avg) }));
  }

  /** Delta between two stored versions of the same suite. */
  compare(suite: string, baselineVersion: string, candidateVersion: string): DeltaRow | null {
    const before = this.averageScore(suite, baselineVersion);
    const after = this.averageScore(suite, candidateVersion);
    if (before === null || after === null) return null;
    return {
      suite,
      baselineVersion,
      candidateVersion,
      baselineScore: before,
      candidateScore: after,
      delta: after - before,
    };
  }

  close(): void {
    this.db.close();
  }
}

/** Write a trend block into a markdown buffer, appending to the report. */
export function renderTrend(
  lines: string[],
  trend: Array<{ version: string; score: number }>,
): void {
  lines.push('');
  lines.push('## 📈 Longitudinal trend');
  lines.push('');
  lines.push('| Version | Average score |');
  lines.push('|---|---|');
  for (const t of trend) lines.push(`| ${t.version} | ${t.score}/100 |`);
}
