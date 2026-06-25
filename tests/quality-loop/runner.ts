// ==============================================================================
// GHITA CODING AGENT - Search Quality Loop Benchmark Runner
//
// Runs the canonical 100-query benchmark, measures per-query latency, computes
// quality metrics, and APPENDS a single JSON line to trends.jsonl so CI can
// detect regressions over time.
//
// Usage:
//   npx tsx tests/quality-loop/runner.ts
//   npx tsx tests/quality-loop/runner.ts --queries=20 --gate-min-f1=0.7
//
// Exit code is non-zero when the F1-score is below `--gate-min-f1`.
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import {
  calculateQualityMetrics,
  MockLLMSearchEngine,
  type BenchmarkQuery,
  type SearchResult,
  type QualityMetrics,
} from './evaluator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface RunnerOptions {
  queryLimit: number | null;
  gateMinF1: number;
  trendsFile: string;
}

function parseArgs(argv: string[]): RunnerOptions {
  const opts: RunnerOptions = {
    queryLimit: null,
    gateMinF1: 0.85,
    trendsFile: path.resolve(__dirname, 'trends.jsonl'),
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--queries=')) {
      const n = Number(arg.slice('--queries='.length));
      if (Number.isFinite(n) && n > 0) opts.queryLimit = Math.floor(n);
    } else if (arg.startsWith('--gate-min-f1=')) {
      const v = Number(arg.slice('--gate-min-f1='.length));
      if (Number.isFinite(v) && v >= 0 && v <= 1) opts.gateMinF1 = v;
    } else if (arg.startsWith('--trends=')) {
      opts.trendsFile = path.resolve(arg.slice('--trends='.length));
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: tsx tests/quality-loop/runner.ts ' +
          '[--queries=N] [--gate-min-f1=0.7] [--trends=path]',
      );
      process.exit(0);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Benchmark execution
// ---------------------------------------------------------------------------

export interface BenchmarkRunResult {
  timestamp: number;
  gitSha: string | null;
  nodeVersion: string;
  queryCount: number;
  totalDurationMs: number;
  avgQueryMs: number;
  p95QueryMs: number;
  metrics: QualityMetrics;
  gate: {
    minF1: number;
    passed: boolean;
  };
}

export function runBenchmark(
  queries: BenchmarkQuery[],
  options: { gateMinF1: number; gitSha?: string | null },
): BenchmarkRunResult {
  if (queries.length === 0) {
    throw new Error('Benchmark requires at least one query.');
  }
  const engine = new MockLLMSearchEngine(queries);

  const latencies: number[] = [];
  const allResults: SearchResult[][] = [];
  for (const q of queries) {
    const t0 = performance.now();
    const results = engine.search(q);
    latencies.push(performance.now() - t0);
    allResults.push(results);
  }

  // Build a results-by-id index so the metrics helper can pull results per query.
  const resultsById = new Map<number, SearchResult[]>();
  for (let i = 0; i < queries.length; i++) {
    const id = queries[i]?.id ?? i;
    resultsById.set(id, allResults[i] ?? []);
  }

  const metrics = calculateQualityMetrics(queries, (q) => resultsById.get(q.id) ?? []);
  const sorted = [...latencies].sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const avg = latencies.reduce((s, x) => s + x, 0) / latencies.length;

  const passed = metrics.f1Score >= options.gateMinF1;
  return {
    timestamp: Date.now(),
    gitSha: options.gitSha ?? null,
    nodeVersion: process.version,
    queryCount: queries.length,
    totalDurationMs: latencies.reduce((s, x) => s + x, 0),
    avgQueryMs: Number(avg.toFixed(4)),
    p95QueryMs: Number(sorted[p95Index].toFixed(4)),
    metrics,
    gate: { minF1: options.gateMinF1, passed },
  };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function readGitSha(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function formatResult(result: BenchmarkRunResult): string {
  const m = result.metrics;
  return [
    `Quality Loop Benchmark — ${new Date(result.timestamp).toISOString()}`,
    `  queries           : ${result.queryCount}`,
    `  precision         : ${(m.precision * 100).toFixed(2)}%`,
    `  recall            : ${(m.recall * 100).toFixed(2)}%`,
    `  f1Score           : ${(m.f1Score * 100).toFixed(2)}% (gate: ${(result.gate.minF1 * 100).toFixed(0)}%)`,
    `  avg query latency : ${result.avgQueryMs.toFixed(2)} ms`,
    `  p95 query latency : ${result.p95QueryMs.toFixed(2)} ms`,
    `  gate              : ${result.gate.passed ? 'PASS ✅' : 'FAIL ❌'}`,
  ].join('\n');
}

function main(): void {
  const opts = parseArgs(process.argv);
  const benchmarkPath = path.resolve(__dirname, 'benchmark.json');
  const raw = fs.readFileSync(benchmarkPath, 'utf8');
  const parsed = JSON.parse(raw) as { queries: BenchmarkQuery[] };
  const queries = opts.queryLimit ? parsed.queries.slice(0, opts.queryLimit) : parsed.queries;

  const result = runBenchmark(queries, {
    gateMinF1: opts.gateMinF1,
    gitSha: readGitSha(),
  });

  console.log(formatResult(result));

  // Append to JSONL trends file
  try {
    fs.mkdirSync(path.dirname(opts.trendsFile), { recursive: true });
    fs.appendFileSync(opts.trendsFile, JSON.stringify(result) + '\n', 'utf8');
  } catch (err) {
    console.error(`Failed to write trends file: ${(err as Error).message}`);
  }

  process.exit(result.gate.passed ? 0 : 1);
}

// Run when invoked directly (not when imported by tests)
const invokedDirectly = (() => {
  try {
    if (!process.argv[1]) return false;
    return path.resolve(fileURLToPath(import.meta.url)).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main();
}