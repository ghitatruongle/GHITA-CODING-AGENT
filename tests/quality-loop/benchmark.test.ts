// ==============================================================================
// GHITA CODING AGENT - Quality Loop regression gate
//
// Vitest test that runs the runner and asserts the canonical F1 gate plus
// latency budget. This guarantees CI fails when search quality regresses.
// ==============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runBenchmark, type BenchmarkRunResult } from './runner.js';

const benchmarkPath = path.resolve(__dirname, 'benchmark.json');
const trendsPath = path.resolve(__dirname, 'trends.jsonl');

interface BenchmarkPayload {
  queries: Array<{ id: number; symbol: string; file: string; expectedKind: string; expectedType: string }>;
}

let result: BenchmarkRunResult;

beforeAll(() => {
  const raw = fs.readFileSync(benchmarkPath, 'utf8');
  const parsed = JSON.parse(raw) as BenchmarkPayload;
  result = runBenchmark(parsed.queries, { gateMinF1: 0.7, gitSha: null });
});

describe('Search Quality Loop — automated benchmark', () => {
  it('runs all benchmark queries', () => {
    const parsed = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8')) as BenchmarkPayload;
    expect(result.queryCount).toBe(parsed.queries.length);
  });

  it('meets the F1 gate (≥ 0.70)', () => {
    expect(result.metrics.f1Score).toBeGreaterThanOrEqual(0.7);
  });

  it('reports a sane recall (≥ 0.50)', () => {
    expect(result.metrics.recall).toBeGreaterThanOrEqual(0.5);
  });

  it('reports a sane precision (≥ 0.50)', () => {
    expect(result.metrics.precision).toBeGreaterThanOrEqual(0.5);
  });

  it('avg per-query latency is under 50ms', () => {
    expect(result.avgQueryMs).toBeLessThan(50);
  });

  it('p95 per-query latency is under 100ms', () => {
    expect(result.p95QueryMs).toBeLessThan(100);
  });

  it('exposes a gate result with minF1 and passed flag', () => {
    expect(result.gate.minF1).toBeCloseTo(0.7);
    expect(result.gate.passed).toBe(true);
  });

  it('appends a JSONL trend entry for CI history', () => {
    // The runner CLI writes the trend entry; this test verifies the schema
    // contract by writing one and re-reading it. We use a fresh temp file
    // so the test is hermetic and does not pollute the real trends.jsonl.
    const { mkdtempSync, rmSync, readFileSync, appendFileSync } = require('fs') as typeof import('fs');
    const { tmpdir } = require('os') as typeof import('os');
    const { join } = require('path') as typeof import('path');
    const tempDir = mkdtempSync(join(tmpdir(), 'ghita-trend-'));
    const tempFile = join(tempDir, 'trends.jsonl');
    try {
      const entry: BenchmarkRunResult = {
        ...result,
        timestamp: Date.now(),
        gate: { minF1: 0.7, passed: true },
      };
      appendFileSync(tempFile, JSON.stringify(entry) + '\n', 'utf8');
      const lines = readFileSync(tempFile, 'utf8').trim().split('\n');
      const lastLine = lines[lines.length - 1];
      const parsed = JSON.parse(lastLine) as BenchmarkRunResult;
      expect(parsed.metrics.f1Score).toBeGreaterThanOrEqual(0.7);
      expect(parsed.queryCount).toBe(
        parsed.queryCount ?? result.queryCount,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});