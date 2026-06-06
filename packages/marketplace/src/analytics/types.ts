// ==============================================================================
// GHITA CODING AGENT - Analytics Types (Phase 39)
// ==============================================================================

/** Daily download counter */
export interface DownloadStats {
  /** Product ID */
  productId: string;
  /** Total downloads (lifetime) */
  total: number;
  /** Daily count (ms → count) */
  daily: Map<string, number>;
  /** Weekly count (ISO week → count) */
  weekly: Map<string, number>;
  /** Version breakdown (version → count) */
  byVersion: Map<string, number>;
  /** Country breakdown (ISO country → count) */
  byCountry: Map<string, number>;
  /** Last updated */
  updatedAt: number;
}

/** Time range for analytics queries */
export interface TimeRange {
  /** Start timestamp (inclusive) */
  start: number;
  /** End timestamp (exclusive) */
  end: number;
}

/** Engagement event */
export interface EngagementEvent {
  /** Event ID */
  id: string;
  /** Product ID */
  productId: string;
  /** User ID */
  userId: string;
  /** Event type */
  type: 'view' | 'install' | 'run' | 'uninstall' | 'rating' | 'review' | 'share';
  /** Session ID (for sessionization) */
  sessionId?: string;
  /** Duration of the event in ms (for 'run') */
  durationMs?: number;
  /** Timestamp */
  timestamp: number;
  /** Additional metadata */
  meta?: Record<string, string | number | boolean>;
}

/** Error report from a plugin */
export interface PluginError {
  /** Error ID */
  id: string;
  /** Product ID */
  productId: string;
  /** Error fingerprint (hash of message+stack) */
  fingerprint: string;
  /** Error message */
  message: string;
  /** Stack trace (truncated) */
  stack?: string;
  /** Count (incremented when same fingerprint seen) */
  count: number;
  /** First seen timestamp */
  firstSeen: number;
  /** Last seen timestamp */
  lastSeen: number;
  /** Affected users */
  affectedUsers: Set<string>;
  /** Whether resolved */
  resolved: boolean;
}

/** Benchmark result for a plugin */
export interface BenchmarkResult {
  /** Product ID */
  productId: string;
  /** Version tested */
  version: string;
  /** Metric name */
  metric: 'startup_ms' | 'memory_mb' | 'cpu_pct' | 'response_ms' | 'throughput_rps';
  /** Value */
  value: number;
  /** Sample count */
  samples: number;
  /** Timestamp */
  timestamp: number;
  /** Environment */
  env: 'dev' | 'ci' | 'prod';
}

/** Trending score (for ranking) */
export interface TrendingScore {
  productId: string;
  /** Score (higher = more trending) */
  score: number;
  /** Components of the score */
  components: {
    downloads: number;
    engagement: number;
    growth: number;
  };
}
