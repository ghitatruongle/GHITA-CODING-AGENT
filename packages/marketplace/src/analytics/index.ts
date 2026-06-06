// ==============================================================================
// GHITA CODING AGENT - Analytics Module Barrel Export (Phase 39)
// ==============================================================================

// --- Types ---
export type {
  DownloadStats,
  TimeRange,
  EngagementEvent,
  PluginError,
  BenchmarkResult,
  TrendingScore,
} from './types.js';

// --- Modules ---
export { DownloadTracker } from './downloads.js';
export { EngagementTracker } from './engagement.js';
export { ErrorAnalytics } from './errors.js';
export { BenchmarkStore } from './benchmark.js';
