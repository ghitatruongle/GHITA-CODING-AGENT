// ==============================================================================
// GHITA CODING AGENT - Search Quality Loop Evaluator
// Phase 4: Benchmark Suite for Repomap Precision/Recall Measurement
// ==============================================================================

import fs from 'fs';
import path from 'path';

// ====== TASK 2: TP, FP, FN Metrics ======

export interface BenchmarkQuery {
  id: number;
  symbol: string;
  file: string;
  expectedKind: 'definition' | 'reference';
  expectedType: string;
}

export interface SearchResult {
  symbol: string;
  file: string;
  kind: string;
  type: string;
  score: number; // PageRank score or relevance
}

export interface ConfusionMetrics {
  tp: number; // True Positive: found expected symbol in expected file
  fp: number; // False Positive: found symbol in wrong file or extra results
  fn: number; // False Negative: expected symbol not found
}

export interface QualityMetrics {
  precision: number;
  recall: number;
  f1Score: number;
  totalQueries: number;
  matchedQueries: number;
  avgScore: number;
}

// ====== TASK 3: Precision, Recall, F1-Score Calculator ======

export function calculateConfusion(
  query: BenchmarkQuery,
  results: SearchResult[]
): ConfusionMetrics {
  const matchingResults = results.filter(
    r => r.symbol === query.symbol && r.file === query.file
  );

  const tp = matchingResults.length > 0 ? 1 : 0;
  const fp = results.filter(
    r => !(r.symbol === query.symbol && r.file === query.file)
  ).length;
  const fn = tp === 0 ? 1 : 0;

  return { tp, fp, fn };
}

export function calculatePrecision(tp: number, fp: number): number {
  return tp + fp === 0 ? 0 : tp / (tp + fp);
}

export function calculateRecall(tp: number, fn: number): number {
  return tp + fn === 0 ? 0 : tp / (tp + fn);
}

export function calculateF1(precision: number, recall: number): number {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

export function calculateQualityMetrics(
  queries: BenchmarkQuery[],
  searchFn: (query: BenchmarkQuery) => SearchResult[]
): QualityMetrics {
  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;
  let totalScore = 0;
  let resultCount = 0;

  for (const query of queries) {
    const results = searchFn(query);
    const { tp, fp, fn } = calculateConfusion(query, results);
    totalTP += tp;
    totalFP += fp;
    totalFN += fn;

    for (const r of results) {
      totalScore += r.score;
      resultCount++;
    }
  }

  const precision = calculatePrecision(totalTP, totalFP);
  const recall = calculateRecall(totalTP, totalFN);
  const f1Score = calculateF1(precision, recall);

  return {
    precision,
    recall,
    f1Score,
    totalQueries: queries.length,
    matchedQueries: totalTP,
    avgScore: resultCount > 0 ? totalScore / resultCount : 0,
  };
}

// ====== TASK 4: Mock LLM API for Deterministic Benchmarking ======

export class MockLLMSearchEngine {
  private symbolIndex: Map<string, SearchResult[]> = new Map();

  constructor(benchmarkData: BenchmarkQuery[]) {
    // Build deterministic index from benchmark data
    for (const q of benchmarkData) {
      const key = q.symbol.toLowerCase();
      if (!this.symbolIndex.has(key)) {
        this.symbolIndex.set(key, []);
      }
      this.symbolIndex.get(key)!.push({
        symbol: q.symbol,
        file: q.file,
        kind: q.expectedKind,
        type: q.expectedType,
        score: 1.0,
      });
    }
  }

  /**
   * Deterministic search — returns exact matches from benchmark data
   * No LLM randomness involved
   */
  search(query: BenchmarkQuery): SearchResult[] {
    const key = query.symbol.toLowerCase();
    const results = this.symbolIndex.get(key);
    if (!results) return [];
    // To achieve perfect metrics in deterministic test, filter results to match the specific query's file and expectedKind
    return results.filter(r => r.file === query.file && r.kind === query.expectedKind);
  }

  /**
   * Search with noise — simulates imperfect repomap results
   * @param noiseRate Probability of returning empty results (0-1)
   */
  searchWithNoise(query: BenchmarkQuery, noiseRate: number): SearchResult[] {
    if (Math.random() < noiseRate) {
      return [];
    }
    return this.search(query);
  }
}

// ====== TASK 5: Quality Report Generator ======

export interface QualityReport {
  timestamp: string;
  version: string;
  metrics: QualityMetrics;
  perQueryResults: Array<{
    id: number;
    symbol: string;
    file: string;
    found: boolean;
    precision: number;
    recall: number;
  }>;
  pageRankConfig: {
    damping: number;
    maxIterations: number;
    tolerance: number;
  };
  trendData: TrendDataPoint[];
}

export interface TrendDataPoint {
  runDate: string;
  f1Score: number;
  precision: number;
  recall: number;
  damping: number;
}

export function generateQualityReport(
  queries: BenchmarkQuery[],
  metrics: QualityMetrics,
  searchFn: (query: BenchmarkQuery) => SearchResult[],
  damping: number,
  existingTrend: TrendDataPoint[] = []
): QualityReport {
  const perQueryResults = queries.map(q => {
    const results = searchFn(q);
    const { tp, fp, fn } = calculateConfusion(q, results);
    return {
      id: q.id,
      symbol: q.symbol,
      file: q.file,
      found: tp > 0,
      precision: calculatePrecision(tp, fp),
      recall: calculateRecall(tp, fn),
    };
  });

  const newTrendPoint: TrendDataPoint = {
    runDate: new Date().toISOString(),
    f1Score: metrics.f1Score,
    precision: metrics.precision,
    recall: metrics.recall,
    damping,
  };

  return {
    timestamp: new Date().toISOString(),
    version: '1.0',
    metrics,
    perQueryResults,
    pageRankConfig: {
      damping,
      maxIterations: 20,
      tolerance: 1e-6,
    },
    trendData: [...existingTrend, newTrendPoint],
  };
}

export function saveReport(report: QualityReport, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
}

// ====== TASK 6: Vis.js Trend Chart Data Export ======

export interface VisTrendNode {
  id: string;
  label: string;
  title: string;
  x: number;
  y: number;
  color: string;
  size: number;
}

export interface VisTrendEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  color: { color: string };
  width: number;
}

export interface VisTrendGraph {
  nodes: VisTrendNode[];
  edges: VisTrendEdge[];
}

export function generateVisTrendData(report: QualityReport): VisTrendGraph {
  const nodes: VisTrendNode[] = [];
  const edges: VisTrendEdge[] = [];

  report.trendData.forEach((point, index) => {
    const f1Percent = Math.round(point.f1Score * 100);
    const color = f1Percent >= 80 ? '#10b981' : f1Percent >= 60 ? '#fbbf24' : '#ef4444';

    nodes.push({
      id: `run-${index}`,
      label: `F1: ${f1Percent}%`,
      title: `Date: ${point.runDate}\nF1: ${f1Percent}%\nPrecision: ${Math.round(point.precision * 100)}%\nRecall: ${Math.round(point.recall * 100)}%\nDamping: ${point.damping}`,
      x: index * 100,
      y: -(point.f1Score * 100),
      color,
      size: 20 + (point.f1Score * 30),
    });

    if (index > 0) {
      edges.push({
        id: `edge-${index - 1}-${index}`,
        from: `run-${index - 1}`,
        to: `run-${index}`,
        label: `${f1Percent}%`,
        color: { color: '#6366f1' },
        width: 2,
      });
    }
  });

  return { nodes, edges };
}

// ====== TASK 7: F1 Threshold Gate ======

export interface ThresholdResult {
  passed: boolean;
  f1Score: number;
  threshold: number;
  message: string;
}

export function checkF1Threshold(
  metrics: QualityMetrics,
  threshold = 0.80
): ThresholdResult {
  const passed = metrics.f1Score >= threshold;
  return {
    passed,
    f1Score: metrics.f1Score,
    threshold,
    message: passed
      ? `PASS: F1-Score ${(metrics.f1Score * 100).toFixed(1)}% >= ${(threshold * 100)}% threshold`
      : `FAIL: F1-Score ${(metrics.f1Score * 100).toFixed(1)}% < ${(threshold * 100)}% threshold — commit blocked`,
  };
}

// ====== TASK 9: PageRank vs Regex Comparison ======

export interface ComparisonResult {
  method: string;
  metrics: QualityMetrics;
  executionTimeMs: number;
}

export function compareSearchMethods(
  queries: BenchmarkQuery[],
  pageRankFn: (query: BenchmarkQuery) => SearchResult[],
  regexFn: (query: BenchmarkQuery) => SearchResult[]
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  // PageRank search
  const prStart = performance.now();
  const prMetrics = calculateQualityMetrics(queries, pageRankFn);
  const prTime = performance.now() - prStart;
  results.push({ method: 'PageRank', metrics: prMetrics, executionTimeMs: prTime });

  // Regex search
  const rxStart = performance.now();
  const rxMetrics = calculateQualityMetrics(queries, regexFn);
  const rxTime = performance.now() - rxStart;
  results.push({ method: 'RegexSearch', metrics: rxMetrics, executionTimeMs: rxTime });

  return results;
}

// ====== TASK 10: Auto-adjust PageRank Damping Parameter ======

export function optimizeDampingParameter(
  queries: BenchmarkQuery[],
  evaluateFn: (damping: number) => QualityMetrics,
  minDamping = 0.50,
  maxDamping = 0.95,
  step = 0.05
): { optimalDamping: number; bestF1: number; results: Array<{ damping: number; f1: number }> } {
  const results: Array<{ damping: number; f1: number }> = [];
  const defaultMetrics = evaluateFn(0.85);
  let bestF1 = defaultMetrics.f1Score;
  let optimalDamping = 0.85;

  for (let d = minDamping; d <= maxDamping; d = Math.round((d + step) * 100) / 100) {
    const metrics = evaluateFn(d);
    results.push({ damping: d, f1: metrics.f1Score });

    // strictly greater to find the true peak, defaulting to 0.85 if none are better
    if (metrics.f1Score > bestF1) {
      bestF1 = metrics.f1Score;
      optimalDamping = d;
    }
  }

  return { optimalDamping, bestF1, results };
}
