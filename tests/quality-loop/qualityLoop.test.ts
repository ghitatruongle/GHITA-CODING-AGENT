import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  calculateConfusion,
  calculatePrecision,
  calculateRecall,
  calculateF1,
  calculateQualityMetrics,
  MockLLMSearchEngine,
  generateQualityReport,
  saveReport,
  generateVisTrendData,
  checkF1Threshold,
  compareSearchMethods,
  optimizeDampingParameter,
  BenchmarkQuery,
  SearchResult,
  QualityReport,
  TrendDataPoint,
} from './evaluator.js';

// ====== Load Benchmark Data ======

const benchmarkPath = path.resolve(__dirname, 'benchmark.json');
const reportOutputPath = path.resolve(__dirname, 'repomap-quality.json');

let benchmarkData: { queries: BenchmarkQuery[] };
let mockEngine: MockLLMSearchEngine;

beforeAll(() => {
  const raw = fs.readFileSync(benchmarkPath, 'utf8');
  benchmarkData = JSON.parse(raw);
  mockEngine = new MockLLMSearchEngine(benchmarkData.queries);
});

afterAll(() => {
  // Cleanup report file if created during tests
  if (fs.existsSync(reportOutputPath)) {
    fs.unlinkSync(reportOutputPath);
  }
});

// TEST SUITE 1: Confusion Matrix (TP, FP, FN) — Task 2

describe('Confusion Matrix (TP, FP, FN)', () => {
  it('should return TP=1 when symbol found in expected file', () => {
    const query: BenchmarkQuery = {
      id: 1,
      symbol: 'PolyglotTagParser',
      file: 'packages/shared/src/parser/polyglotTags.ts',
      expectedKind: 'definition',
      expectedType: 'class',
    };
    const results: SearchResult[] = [
      {
        symbol: 'PolyglotTagParser',
        file: 'packages/shared/src/parser/polyglotTags.ts',
        kind: 'definition',
        type: 'class',
        score: 1.0,
      },
    ];
    const { tp, fp, fn } = calculateConfusion(query, results);
    expect(tp).toBe(1);
    expect(fp).toBe(0);
    expect(fn).toBe(0);
  });

  it('should return FN=1 when symbol not found', () => {
    const query: BenchmarkQuery = {
      id: 1,
      symbol: 'NonExistentClass',
      file: 'some/file.ts',
      expectedKind: 'definition',
      expectedType: 'class',
    };
    const { tp, fp, fn } = calculateConfusion(query, []);
    expect(tp).toBe(0);
    expect(fp).toBe(0);
    expect(fn).toBe(1);
  });

  it('should return FP>0 when wrong file matches', () => {
    const query: BenchmarkQuery = {
      id: 1,
      symbol: 'MyClass',
      file: 'expected/file.ts',
      expectedKind: 'definition',
      expectedType: 'class',
    };
    const results: SearchResult[] = [
      { symbol: 'MyClass', file: 'wrong/file.ts', kind: 'definition', type: 'class', score: 0.5 },
      {
        symbol: 'OtherClass',
        file: 'another/file.ts',
        kind: 'definition',
        type: 'class',
        score: 0.3,
      },
    ];
    const { tp, fp, fn } = calculateConfusion(query, results);
    expect(tp).toBe(0);
    expect(fp).toBe(2);
    expect(fn).toBe(1);
  });

  it('should handle multiple results with one correct match', () => {
    const query: BenchmarkQuery = {
      id: 1,
      symbol: 'PageRankRanker',
      file: 'packages/shared/src/parser/pageRankRanker.ts',
      expectedKind: 'definition',
      expectedType: 'class',
    };
    const results: SearchResult[] = [
      {
        symbol: 'PageRankRanker',
        file: 'packages/shared/src/parser/pageRankRanker.ts',
        kind: 'definition',
        type: 'class',
        score: 1.0,
      },
      {
        symbol: 'PageRankRanker',
        file: 'packages/shared/src/parser/pageRankRanker.ts',
        kind: 'reference',
        type: 'class',
        score: 0.8,
      },
      {
        symbol: 'OtherSymbol',
        file: 'other/file.ts',
        kind: 'definition',
        type: 'class',
        score: 0.3,
      },
    ];
    const { tp, fp, fn } = calculateConfusion(query, results);
    expect(tp).toBe(1);
    expect(fp).toBe(1); // only the "OtherSymbol" counts as FP
    expect(fn).toBe(0);
  });
});

// TEST SUITE 2: Precision, Recall, F1 — Task 3

describe('Precision, Recall, F1-Score Calculations', () => {
  it('calculatePrecision: perfect precision (no FP)', () => {
    expect(calculatePrecision(10, 0)).toBe(1);
  });

  it('calculatePrecision: zero precision (all FP)', () => {
    expect(calculatePrecision(0, 10)).toBe(0);
  });

  it('calculatePrecision: mixed TP and FP', () => {
    expect(calculatePrecision(3, 7)).toBeCloseTo(0.3, 5);
  });

  it('calculatePrecision: handles zero denominator', () => {
    expect(calculatePrecision(0, 0)).toBe(0);
  });

  it('calculateRecall: perfect recall (no FN)', () => {
    expect(calculateRecall(10, 0)).toBe(1);
  });

  it('calculateRecall: zero recall (all FN)', () => {
    expect(calculateRecall(0, 10)).toBe(0);
  });

  it('calculateRecall: handles zero denominator', () => {
    expect(calculateRecall(0, 0)).toBe(0);
  });

  it('calculateF1: perfect F1', () => {
    expect(calculateF1(1, 1)).toBe(1);
  });

  it('calculateF1: zero F1', () => {
    expect(calculateF1(0, 0)).toBe(0);
  });

  it('calculateF1: balanced precision/recall', () => {
    expect(calculateF1(0.8, 0.8)).toBeCloseTo(0.8, 5);
  });

  it('calculateF1: imbalanced precision/recall', () => {
    // F1 = 2 * (0.9 * 0.5) / (0.9 + 0.5) = 0.9 / 1.4 ≈ 0.6428
    expect(calculateF1(0.9, 0.5)).toBeCloseTo(0.6428, 3);
  });

  it('calculateF1: handles zero precision', () => {
    expect(calculateF1(0, 0.5)).toBe(0);
  });
});

// TEST SUITE 3: Mock LLM Search Engine — Task 4

describe('Mock LLM Search Engine (Deterministic)', () => {
  it('should find symbol that exists in benchmark data', () => {
    const query = benchmarkData.queries[0]; // PolyglotTagParser
    const results = mockEngine.search(query);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol).toBe(query.symbol);
    expect(results[0].file).toBe(query.file);
  });

  it('should return empty array for non-existent symbol', () => {
    const fakeQuery: BenchmarkQuery = {
      id: 999,
      symbol: 'CompletelyFakeSymbol12345',
      file: 'fake/path.ts',
      expectedKind: 'definition',
      expectedType: 'class',
    };
    const results = mockEngine.search(fakeQuery);
    expect(results).toEqual([]);
  });

  it('should return deterministic results (same input = same output)', () => {
    const query = benchmarkData.queries[5]; // rankSymbols
    const results1 = mockEngine.search(query);
    const results2 = mockEngine.search(query);
    expect(results1).toEqual(results2);
  });

  it('should handle all 100 benchmark queries without error', () => {
    for (const q of benchmarkData.queries) {
      const results = mockEngine.search(q);
      expect(Array.isArray(results)).toBe(true);
    }
  });

  it('searchWithNoise should sometimes return empty based on noiseRate', () => {
    const query = benchmarkData.queries[0];
    let emptyCount = 0;
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const results = mockEngine.searchWithNoise(query, 0.5);
      if (results.length === 0) emptyCount++;
    }

    // With 50% noise rate, roughly 40-60% should be empty (statistical)
    expect(emptyCount).toBeGreaterThan(300);
    expect(emptyCount).toBeLessThan(700);
  });
});

// TEST SUITE 4: Full Quality Metrics Calculation

describe('calculateQualityMetrics (Full Pipeline)', () => {
  it('should return perfect metrics with deterministic mock', () => {
    const metrics = calculateQualityMetrics(benchmarkData.queries, (q) => mockEngine.search(q));
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.f1Score).toBe(1);
    expect(metrics.totalQueries).toBe(100);
    expect(metrics.matchedQueries).toBe(100);
  });

  it('should degrade metrics with noisy search', () => {
    // Use a fixed seed approach: always return empty for specific queries
    const noisySearch = (q: BenchmarkQuery): SearchResult[] => {
      if (q.id % 3 === 0) return []; // Every 3rd query fails
      return mockEngine.search(q);
    };

    const metrics = calculateQualityMetrics(benchmarkData.queries, noisySearch);
    expect(metrics.precision).toBe(1); // No FP, just missing results
    expect(metrics.recall).toBeLessThan(1); // ~33% FN
    expect(metrics.f1Score).toBeLessThan(1);
    expect(metrics.matchedQueries).toBeLessThan(100);
  });

  it('should return zero metrics for all-empty search', () => {
    const metrics = calculateQualityMetrics(benchmarkData.queries, () => []);
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1Score).toBe(0);
    expect(metrics.matchedQueries).toBe(0);
  });

  it('should handle single query', () => {
    const singleQuery = [benchmarkData.queries[0]];
    const metrics = calculateQualityMetrics(singleQuery, (q) => mockEngine.search(q));
    expect(metrics.totalQueries).toBe(1);
    expect(metrics.f1Score).toBe(1);
  });
});

// TEST SUITE 5: Quality Report Generation — Task 5

describe('Quality Report Generation', () => {
  it('should generate complete report with all fields', () => {
    const metrics = calculateQualityMetrics(benchmarkData.queries, (q) => mockEngine.search(q));
    const report = generateQualityReport(
      benchmarkData.queries,
      metrics,
      (q) => mockEngine.search(q),
      0.85,
    );

    expect(report.version).toBe('1.0');
    expect(report.timestamp).toBeTruthy();
    expect(report.metrics.f1Score).toBe(1);
    expect(report.perQueryResults.length).toBe(100);
    expect(report.pageRankConfig.damping).toBe(0.85);
    expect(report.trendData.length).toBe(1);
  });

  it('should include per-query found/not-found status', () => {
    const metrics = calculateQualityMetrics(benchmarkData.queries, (q) => mockEngine.search(q));
    const report = generateQualityReport(
      benchmarkData.queries,
      metrics,
      (q) => mockEngine.search(q),
      0.85,
    );

    const allFound = report.perQueryResults.every((r) => r.found);
    expect(allFound).toBe(true);
  });

  it('should accumulate trend data from previous runs', () => {
    const existingTrend: TrendDataPoint[] = [
      {
        runDate: '2026-05-20T00:00:00Z',
        f1Score: 0.75,
        precision: 0.8,
        recall: 0.7,
        damping: 0.85,
      },
      {
        runDate: '2026-05-21T00:00:00Z',
        f1Score: 0.82,
        precision: 0.85,
        recall: 0.79,
        damping: 0.85,
      },
    ];

    const metrics = calculateQualityMetrics(benchmarkData.queries, (q) => mockEngine.search(q));
    const report = generateQualityReport(
      benchmarkData.queries,
      metrics,
      (q) => mockEngine.search(q),
      0.85,
      existingTrend,
    );

    expect(report.trendData.length).toBe(3);
    expect(report.trendData[0].f1Score).toBe(0.75);
    expect(report.trendData[2].f1Score).toBe(1);
  });

  it('should save report to file', () => {
    const metrics = calculateQualityMetrics(benchmarkData.queries, (q) => mockEngine.search(q));
    const report = generateQualityReport(
      benchmarkData.queries,
      metrics,
      (q) => mockEngine.search(q),
      0.85,
    );

    saveReport(report, reportOutputPath);
    expect(fs.existsSync(reportOutputPath)).toBe(true);

    const saved = JSON.parse(fs.readFileSync(reportOutputPath, 'utf8'));
    expect(saved.version).toBe('1.0');
    expect(saved.metrics.f1Score).toBe(1);
  });
});

// TEST SUITE 6: Vis.js Trend Chart Data — Task 6

describe('Vis.js Trend Chart Data Export', () => {
  it('should generate nodes and edges from trend data', () => {
    const report: QualityReport = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      metrics: {
        precision: 0.9,
        recall: 0.85,
        f1Score: 0.874,
        totalQueries: 100,
        matchedQueries: 85,
        avgScore: 0.9,
      },
      perQueryResults: [],
      pageRankConfig: { damping: 0.85, maxIterations: 20, tolerance: 1e-6 },
      trendData: [
        { runDate: '2026-05-20', f1Score: 0.7, precision: 0.75, recall: 0.65, damping: 0.85 },
        { runDate: '2026-05-21', f1Score: 0.8, precision: 0.82, recall: 0.78, damping: 0.85 },
        { runDate: '2026-05-22', f1Score: 0.874, precision: 0.9, recall: 0.85, damping: 0.85 },
      ],
    };

    const graph = generateVisTrendData(report);
    expect(graph.nodes.length).toBe(3);
    expect(graph.edges.length).toBe(2);
  });

  it('should color nodes based on F1 threshold', () => {
    const report: QualityReport = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      metrics: {
        precision: 0.5,
        recall: 0.5,
        f1Score: 0.5,
        totalQueries: 10,
        matchedQueries: 5,
        avgScore: 0.5,
      },
      perQueryResults: [],
      pageRankConfig: { damping: 0.85, maxIterations: 20, tolerance: 1e-6 },
      trendData: [
        { runDate: '2026-05-20', f1Score: 0.5, precision: 0.5, recall: 0.5, damping: 0.85 }, // Red
        { runDate: '2026-05-21', f1Score: 0.7, precision: 0.7, recall: 0.7, damping: 0.85 }, // Yellow
        { runDate: '2026-05-22', f1Score: 0.85, precision: 0.85, recall: 0.85, damping: 0.85 }, // Green
      ],
    };

    const graph = generateVisTrendData(report);
    expect(graph.nodes[0].color).toBe('#ef4444'); // Red (< 60%)
    expect(graph.nodes[1].color).toBe('#fbbf24'); // Yellow (60-80%)
    expect(graph.nodes[2].color).toBe('#10b981'); // Green (>= 80%)
  });

  it('should handle single trend point (no edges)', () => {
    const report: QualityReport = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      metrics: {
        precision: 1,
        recall: 1,
        f1Score: 1,
        totalQueries: 10,
        matchedQueries: 10,
        avgScore: 1,
      },
      perQueryResults: [],
      pageRankConfig: { damping: 0.85, maxIterations: 20, tolerance: 1e-6 },
      trendData: [{ runDate: '2026-05-22', f1Score: 1, precision: 1, recall: 1, damping: 0.85 }],
    };

    const graph = generateVisTrendData(report);
    expect(graph.nodes.length).toBe(1);
    expect(graph.edges.length).toBe(0);
  });
});

// TEST SUITE 7: F1 Threshold Gate — Task 7

describe('F1 Threshold Gate', () => {
  it('should PASS when F1 >= 80%', () => {
    const metrics = {
      precision: 0.85,
      recall: 0.8,
      f1Score: 0.824,
      totalQueries: 100,
      matchedQueries: 80,
      avgScore: 0.9,
    };
    const result = checkF1Threshold(metrics, 0.8);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('PASS');
  });

  it('should FAIL when F1 < 80%', () => {
    const metrics = {
      precision: 0.6,
      recall: 0.5,
      f1Score: 0.545,
      totalQueries: 100,
      matchedQueries: 50,
      avgScore: 0.6,
    };
    const result = checkF1Threshold(metrics, 0.8);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('FAIL');
    expect(result.message).toContain('blocked');
  });

  it('should PASS at exact threshold', () => {
    const metrics = {
      precision: 0.8,
      recall: 0.8,
      f1Score: 0.8,
      totalQueries: 100,
      matchedQueries: 80,
      avgScore: 0.8,
    };
    const result = checkF1Threshold(metrics, 0.8);
    expect(result.passed).toBe(true);
  });

  it('should support custom threshold', () => {
    const metrics = {
      precision: 0.9,
      recall: 0.9,
      f1Score: 0.9,
      totalQueries: 100,
      matchedQueries: 90,
      avgScore: 0.9,
    };
    const result = checkF1Threshold(metrics, 0.95);
    expect(result.passed).toBe(false);
  });

  it('should always pass with perfect metrics', () => {
    const metrics = {
      precision: 1,
      recall: 1,
      f1Score: 1,
      totalQueries: 100,
      matchedQueries: 100,
      avgScore: 1,
    };
    const result = checkF1Threshold(metrics, 0.8);
    expect(result.passed).toBe(true);
    expect(result.f1Score).toBe(1);
  });
});

// TEST SUITE 8: PageRank vs Regex Comparison — Task 9

describe('PageRank vs Regex Search Comparison', () => {
  it('should compare both methods and return metrics + timing', () => {
    const pageRankFn = (q: BenchmarkQuery) => mockEngine.search(q);
    const regexFn = (q: BenchmarkQuery): SearchResult[] => {
      // Regex always finds (simulates broader but less precise search)
      return [
        {
          symbol: q.symbol,
          file: q.file,
          kind: q.expectedKind,
          type: q.expectedType,
          score: 0.5,
        },
      ];
    };

    const results = compareSearchMethods(benchmarkData.queries, pageRankFn, regexFn);
    expect(results.length).toBe(2);
    expect(results[0].method).toBe('PageRank');
    expect(results[1].method).toBe('RegexSearch');
    expect(results[0].metrics.f1Score).toBe(1);
    expect(results[1].metrics.f1Score).toBe(1);
    expect(results[0].executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(results[1].executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should show PageRank advantage on precision with noisy regex', () => {
    const pageRankFn = (q: BenchmarkQuery) => mockEngine.search(q);
    const noisyRegexFn = (q: BenchmarkQuery): SearchResult[] => {
      // Regex returns extra false results
      return [
        { symbol: q.symbol, file: q.file, kind: q.expectedKind, type: q.expectedType, score: 0.9 },
        {
          symbol: 'FakeSymbol',
          file: 'wrong/file.ts',
          kind: 'definition',
          type: 'class',
          score: 0.3,
        },
      ];
    };

    const results = compareSearchMethods(benchmarkData.queries, pageRankFn, noisyRegexFn);
    // PageRank should have higher precision (no FP)
    expect(results[0].metrics.precision).toBeGreaterThan(results[1].metrics.precision);
  });
});

// TEST SUITE 9: Auto-adjust Damping Parameter — Task 10

describe('Auto-adjust PageRank Damping Parameter', () => {
  it('should find optimal damping within range', () => {
    // Simulate: F1 peaks at damping=0.85
    const evaluateFn = (
      damping: number,
    ): {
      precision: number;
      recall: number;
      f1Score: number;
      totalQueries: number;
      matchedQueries: number;
      avgScore: number;
    } => {
      // Bell curve centered at 0.85
      const f1 = Math.exp(-Math.pow((damping - 0.85) / 0.15, 2) * 2);
      return {
        precision: f1,
        recall: f1,
        f1Score: f1,
        totalQueries: 100,
        matchedQueries: 100,
        avgScore: f1,
      };
    };

    const result = optimizeDampingParameter(benchmarkData.queries, evaluateFn, 0.5, 0.95, 0.05);
    expect(result.optimalDamping).toBeCloseTo(0.85, 1);
    expect(result.bestF1).toBeGreaterThan(0.9);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('should return results for each damping step', () => {
    const evaluateFn = () => ({
      precision: 0.8,
      recall: 0.8,
      f1Score: 0.8,
      totalQueries: 100,
      matchedQueries: 80,
      avgScore: 0.8,
    });
    const result = optimizeDampingParameter(benchmarkData.queries, evaluateFn, 0.5, 0.95, 0.1);
    // 0.50, 0.60, 0.70, 0.80, 0.90 = 5 steps
    expect(result.results.length).toBe(5);
  });

  it('should default to 0.85 if all dampings equal', () => {
    const evaluateFn = () => ({
      precision: 0.5,
      recall: 0.5,
      f1Score: 0.5,
      totalQueries: 100,
      matchedQueries: 50,
      avgScore: 0.5,
    });
    const result = optimizeDampingParameter(benchmarkData.queries, evaluateFn);
    expect(result.optimalDamping).toBe(0.85); // First one tested
  });
});

// TEST SUITE 10: Benchmark Data Integrity

describe('Benchmark Data Integrity', () => {
  it('should have exactly 100 queries', () => {
    expect(benchmarkData.queries.length).toBe(100);
  });

  it('should have unique IDs for all queries', () => {
    const ids = benchmarkData.queries.map((q) => q.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(100);
  });

  it('should have all required fields in each query', () => {
    for (const q of benchmarkData.queries) {
      expect(q.id).toBeDefined();
      expect(q.symbol).toBeDefined();
      expect(q.file).toBeDefined();
      expect(q.expectedKind).toBeDefined();
      expect(q.expectedType).toBeDefined();
      expect(['definition', 'reference']).toContain(q.expectedKind);
    }
  });

  it('should cover multiple packages', () => {
    const packages = new Set(benchmarkData.queries.map((q) => q.file.split('/')[1]));
    expect(packages.size).toBeGreaterThanOrEqual(4); // shared, agents, ai-engine, computer-use, skills, communication
  });

  it('should include both definition and reference queries', () => {
    const definitions = benchmarkData.queries.filter((q) => q.expectedKind === 'definition');
    const references = benchmarkData.queries.filter((q) => q.expectedKind === 'reference');
    expect(definitions.length).toBeGreaterThan(0);
    expect(references.length).toBeGreaterThan(0);
  });
});
