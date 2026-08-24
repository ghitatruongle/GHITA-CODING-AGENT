// SQLite (or memory) per-node flow state with idempotent resume, plus a
// blocking `withHumanFeedback` helper for human-in-the-loop inside flows
// (crewai Flow persistence pattern).

import Database from 'better-sqlite3';
import type { RequestHumanInputManager } from './hitl.js';

export interface FlowNodeState {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  attempts: number;
  output?: unknown;
  error?: string;
  updatedAt: number;
}

export interface FlowStateStore {
  save(state: FlowNodeState): void;
  get(nodeId: string): FlowNodeState | undefined;
  list(): FlowNodeState[];
  remove(nodeId: string): boolean;
  clear(): void;
}

/** In-memory store (default; usable in tests and short flows). */
export class MemoryFlowStateStore implements FlowStateStore {
  private states = new Map<string, FlowNodeState>();

  save(state: FlowNodeState): void {
    this.states.set(state.nodeId, state);
  }

  get(nodeId: string): FlowNodeState | undefined {
    return this.states.get(nodeId);
  }

  list(): FlowNodeState[] {
    return [...this.states.values()];
  }

  remove(nodeId: string): boolean {
    return this.states.delete(nodeId);
  }

  clear(): void {
    this.states.clear();
  }
}

/** SQLite-backed store: survives restarts, enables resume-between-runs. */
export class SqliteFlowStateStore implements FlowStateStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS flow_states (
        node_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        output TEXT,
        error TEXT,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  save(state: FlowNodeState): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO flow_states (node_id, status, attempts, output, error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        state.nodeId,
        state.status,
        state.attempts,
        state.output === undefined ? null : JSON.stringify(state.output),
        state.error ?? null,
        state.updatedAt,
      );
  }

  get(nodeId: string): FlowNodeState | undefined {
    const row = this.db.prepare('SELECT * FROM flow_states WHERE node_id = ?').get(nodeId) as
      | {
          node_id: string;
          status: FlowNodeState['status'];
          attempts: number;
          output: string | null;
          error: string | null;
          updated_at: number;
        }
      | undefined;
    if (!row) return undefined;
    return {
      nodeId: row.node_id,
      status: row.status,
      attempts: row.attempts,
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error ?? undefined,
      updatedAt: row.updated_at,
    };
  }

  list(): FlowNodeState[] {
    const rows = this.db.prepare('SELECT * FROM flow_states').all() as Array<{
      node_id: string;
      status: FlowNodeState['status'];
      attempts: number;
      output: string | null;
      error: string | null;
      updated_at: number;
    }>;
    return rows.map((r) => ({
      nodeId: r.node_id,
      status: r.status,
      attempts: r.attempts,
      output: r.output ? JSON.parse(r.output) : undefined,
      error: r.error ?? undefined,
      updatedAt: r.updated_at,
    }));
  }

  remove(nodeId: string): boolean {
    return this.db.prepare('DELETE FROM flow_states WHERE node_id = ?').run(nodeId).changes > 0;
  }

  clear(): void {
    this.db.exec('DELETE FROM flow_states');
  }

  close(): void {
    this.db.close();
  }
}

/** Wrap a node executor with idempotent resume: completed nodes are replayed. */
export async function runFlowNodeWithResume(
  store: FlowStateStore,
  nodeId: string,
  execute: (attempts: number) => Promise<unknown>,
): Promise<FlowNodeState> {
  const existing = store.get(nodeId);
  if (existing?.status === 'completed') {
    return existing; // idempotent resume — do not re-run.
  }
  const started: FlowNodeState = {
    nodeId,
    status: 'running',
    attempts: (existing?.attempts ?? 0) + 1,
    updatedAt: Date.now(),
  };
  store.save(started);
  try {
    const output = await execute(started.attempts);
    const done: FlowNodeState = { ...started, status: 'completed', output, updatedAt: Date.now() };
    store.save(done);
    return done;
  } catch (err) {
    const failed: FlowNodeState = {
      ...started,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      updatedAt: Date.now(),
    };
    store.save(failed);
    return failed;
  }
}

export interface HumanFeedbackResult {
  nodeId: string;
  answer?: string;
  cancelled: boolean;
}

/**
 * Blocking human-in-the-loop inside a flow: asks via the HITL manager and
 * resolves with the answer (crewai human_feedback pattern).
 */
export async function withHumanFeedback(
  manager: RequestHumanInputManager,
  nodeId: string,
  question: string,
  options: { urgency?: 'low' | 'normal' | 'high'; options?: string[] } = {},
): Promise<HumanFeedbackResult> {
  const req = manager.request({ question, urgency: options.urgency, options: options.options });
  const answered = await manager.awaitAnswer(req.id);
  return {
    nodeId,
    answer: answered.answer,
    cancelled: answered.state !== 'answered',
  };
}
