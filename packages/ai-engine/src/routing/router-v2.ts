// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 4.4: Router v2
// ------------------------------------------------------------------------------
// Bandit per (request_type x model) with SQLite persistence + complexity
// classifier run BEFORE the bandit (pattern: litellm complexity_router +
// adaptive_router). Persisted arm state survives restarts.
// ==============================================================================

import Database from 'better-sqlite3';
import { AdaptiveBanditRouter } from './adaptive-router.js';
import type { RequestBucket, BanditArm, SignalKind } from './adaptive-router.js';

// ---------------------------------------------------------------------------
// Complexity classifier (keyword + length heuristic, runs pre-bandit)
// ---------------------------------------------------------------------------

export type TurnTier = 'simple' | 'moderate' | 'complex';

export interface ComplexityClassifierOptions {
  simpleThreshold?: number;
  complexThreshold?: number;
  complexKeywords?: RegExp;
  simpleKeywords?: RegExp;
}

const DEFAULT_COMPLEX_KEYWORDS =
  /\b(architect|design|refactor|debug|analyze|compare|explain|plan|strategy|security|vulnerability|migrate|optimize|performance|review|test|implement|build|create)\b/i;
const DEFAULT_SIMPLE_KEYWORDS = /\b(hello|hi|thanks|ok|yes|no|bye|good|great|sure|summarize)\b/i;

/** Classify a user message into a complexity tier before bandit selection. */
export function classifyTier(userMessage: string, options?: ComplexityClassifierOptions): TurnTier {
  const simpleThreshold = options?.simpleThreshold ?? 80;
  const complexThreshold = options?.complexThreshold ?? 2000;
  const complexKw = options?.complexKeywords ?? DEFAULT_COMPLEX_KEYWORDS;
  const simpleKw = options?.simpleKeywords ?? DEFAULT_SIMPLE_KEYWORDS;

  const trimmed = userMessage.trim();
  const len = trimmed.length;

  if (complexKw.test(trimmed)) return 'complex';
  if (simpleKw.test(trimmed) && len < simpleThreshold * 2) return 'simple';
  if (len <= simpleThreshold) return 'simple';
  if (len >= complexThreshold) return 'complex';
  return 'moderate';
}

/** Map a tier to the request buckets the bandit should consider. */
export function tierToBuckets(tier: TurnTier): RequestBucket[] {
  switch (tier) {
    case 'simple':
      return ['chat', 'embed'];
    case 'moderate':
      return ['chat', 'tool', 'code'];
    case 'complex':
      return ['chat', 'tool', 'code', 'reasoning'];
  }
}

// ---------------------------------------------------------------------------
// Persistent bandit router (state survives restart via SQLite)
// ---------------------------------------------------------------------------

export interface PersistentBanditConfig {
  /** Path to the SQLite file (':memory:' for tests). */
  dbPath: string;
  /** Table name for arm state (default 'bandit_arms'). */
  table?: string;
}

interface ArmRow {
  arm_id: string;
  label: string;
  alpha: number;
  beta: number;
  wins: number;
  losses: number;
  total: number;
  avg_latency_ms: number;
}

/**
 * AdaptiveBanditRouter with SQLite persistence. Arm parameters are written
 * on every observe() and loaded in the constructor, so decisions survive
 * process restarts.
 */
export class PersistentBanditRouter extends AdaptiveBanditRouter {
  private readonly db: Database.Database;
  private readonly table: string;

  constructor(dbPath: string, table = 'bandit_arms') {
    super({});
    // Table names cannot be parameterized in SQLite — validate against a
    // strict identifier pattern to prevent SQL injection.
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw new Error(`Invalid table name: '${table}'`);
    }
    this.table = table;
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        arm_id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        alpha REAL NOT NULL,
        beta REAL NOT NULL,
        wins INTEGER NOT NULL,
        losses INTEGER NOT NULL,
        total INTEGER NOT NULL,
        avg_latency_ms REAL NOT NULL DEFAULT 0
      );
    `);
    this.loadArms();
  }

  /** Register an arm and persist it immediately. */
  registerArm(id: string, label = id): BanditArm {
    const arm = super.registerArm(id, label);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ${this.table} (arm_id, label, alpha, beta, wins, losses, total, avg_latency_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        arm.id,
        arm.label,
        arm.alpha,
        arm.beta,
        arm.wins,
        arm.losses,
        arm.total,
        arm.avgLatencyMs,
      );
    return arm;
  }

  /** Record a signal and persist updated arm parameters. */
  observe(armId: string, kind: SignalKind, latencyMs = 0): void {
    super.observe(armId, kind, latencyMs);
    const arm = this.get(armId);
    if (!arm) return;
    this.db
      .prepare(
        `UPDATE ${this.table} SET alpha = ?, beta = ?, wins = ?, losses = ?, total = ?, avg_latency_ms = ?
         WHERE arm_id = ?`,
      )
      .run(arm.alpha, arm.beta, arm.wins, arm.losses, arm.total, arm.avgLatencyMs, armId);
  }

  /** Close the database. */
  close(): void {
    this.db.close();
  }

  private loadArms(): void {
    const rows = this.db.prepare(`SELECT * FROM ${this.table}`).all() as ArmRow[];
    for (const row of rows) {
      // Use super.registerArm directly: this.registerArm would persist the
      // fresh default priors back to the DB, wiping the learned state.
      super.registerArm(row.arm_id, row.label);
      const arm = this.get(row.arm_id);
      if (arm) {
        arm.alpha = row.alpha;
        arm.beta = row.beta;
        arm.wins = row.wins;
        arm.losses = row.losses;
        arm.total = row.total;
        arm.avgLatencyMs = row.avg_latency_ms;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// High-level router v2: classifier -> bucket filter -> bandit -> persist
// ---------------------------------------------------------------------------

export interface RouterV2Options {
  dbPath: string;
  /** Map of tier -> arm ids the bandit may pick from for that tier. */
  tierArms?: Partial<Record<TurnTier, string[]>>;
}

export class RouterV2 {
  readonly bandit: PersistentBanditRouter;
  private readonly tierArms: Partial<Record<TurnTier, string[]>>;

  constructor(options: RouterV2Options) {
    this.bandit = new PersistentBanditRouter(options.dbPath);
    this.tierArms = options.tierArms ?? {};
  }

  /** Register all arms that should be available. */
  registerArms(arms: Array<{ id: string; label?: string }>): void {
    for (const arm of arms) {
      this.bandit.registerArm(arm.id, arm.label ?? arm.id);
    }
  }

  /**
   * Select a model for a user message: classify tier -> filter arms ->
   * bandit select (Thompson sampling).
   */
  select(
    userMessage: string,
    bucket: RequestBucket = 'chat',
  ): { arm: BanditArm; tier: TurnTier; bucket: RequestBucket } {
    const tier = classifyTier(userMessage);
    const bucketTier = this.bucketTier(bucket);

    // Tier arms (explicit map) take priority; otherwise use the bucket.
    const candidates = this.tierArms[tier] ?? this.tierArms[bucketTier] ?? undefined;

    const arm = candidates
      ? this.bandit.select({ bucket, candidates })
      : this.bandit.select({ bucket });

    return { arm, tier, bucket };
  }

  /** Observe the outcome and persist. */
  observe(armId: string, kind: SignalKind, latencyMs = 0): void {
    this.bandit.observe(armId, kind, latencyMs);
  }

  close(): void {
    this.bandit.close();
  }

  private bucketTier(bucket: RequestBucket): TurnTier {
    switch (bucket) {
      case 'chat':
      case 'embed':
        return 'simple';
      case 'tool':
      case 'code':
        return 'moderate';
      case 'reasoning':
      case 'image':
        return 'complex';
      default:
        return 'moderate';
    }
  }
}
