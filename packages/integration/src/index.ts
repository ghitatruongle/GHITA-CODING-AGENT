// ==============================================================================
// GHITA CODING AGENT - Final Integration Package (Phase 51)
// Cross-module smoke tests, performance regression, security pen test, release
// ==============================================================================

// --- Types ---

export interface SmokeTestResult {
  module: string;
  passed: boolean;
  latencyMs: number;
  details?: string;
}

export interface PerformanceBenchmark {
  name: string;
  metric: string;
  value: number;
  baseline: number;
  regression: boolean;
  thresholdPct: number;
}

export interface SecurityTestResult {
  test: string;
  category: string;
  passed: boolean;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  details?: string;
}

export interface ReleaseCandidate {
  version: string;
  buildId: string;
  timestamp: number;
  smokeTestsPassed: boolean;
  performancePassed: boolean;
  securityPassed: boolean;
  readyForRelease: boolean;
}

// --- Integration Test Runner ---

export class IntegrationTestRunner {
  private smokeResults: SmokeTestResult[] = [];
  private perfResults: PerformanceBenchmark[] = [];
  private secResults: SecurityTestResult[] = [];

  /**
   * Run cross-module smoke tests.
   * Validates that all modules can be imported and their main exports exist.
   */
  async runSmokeTests(modules: Array<{ name: string; check: () => Promise<boolean> }>): Promise<SmokeTestResult[]> {
    this.smokeResults = [];

    for (const mod of modules) {
      const start = performance.now();
      try {
        const passed = await mod.check();
        this.smokeResults.push({
          module: mod.name,
          passed,
          latencyMs: Math.round(performance.now() - start),
        });
      } catch (err) {
        this.smokeResults.push({
          module: mod.name,
          passed: false,
          latencyMs: Math.round(performance.now() - start),
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return this.smokeResults;
  }

  /**
   * Run performance regression tests against baselines.
   */
  runPerformanceBenchmarks(
    benchmarks: Array<{ name: string; metric: string; value: number; baseline: number }>,
    thresholdPct = 10,
  ): PerformanceBenchmark[] {
    this.perfResults = benchmarks.map((b) => {
      const deviation = ((b.value - b.baseline) / b.baseline) * 100;
      return {
        ...b,
        thresholdPct,
        regression: Math.abs(deviation) > thresholdPct && b.value > b.baseline,
      };
    });
    return this.perfResults;
  }

  /**
   * Run security penetration tests.
   */
  runSecurityTests(
    tests: Array<{ test: string; category: string; passed: boolean; severity: SecurityTestResult['severity']; details?: string }>,
  ): SecurityTestResult[] {
    this.secResults = tests.map((t) => ({ ...t }));
    return this.secResults;
  }

  /**
   * Generate a release candidate evaluation.
   */
  evaluateReleaseCandidate(version: string): ReleaseCandidate {
    const smokePassed = this.smokeResults.length > 0 && this.smokeResults.every((r) => r.passed);
    const performancePassed = this.perfResults.every((r) => !r.regression);
    const securityPassed = this.secResults.filter((r) => r.severity === 'critical' || r.severity === 'high').every((r) => r.passed);

    return {
      version,
      buildId: `build-${Date.now()}`,
      timestamp: Date.now(),
      smokeTestsPassed: smokePassed,
      performancePassed,
      securityPassed,
      readyForRelease: smokePassed && performancePassed && securityPassed,
    };
  }

  /**
   * Get a full report summary.
   */
  getReport(): {
    smoke: { total: number; passed: number; failed: number };
    performance: { total: number; regressions: number };
    security: { total: number; critical: number; high: number };
  } {
    return {
      smoke: {
        total: this.smokeResults.length,
        passed: this.smokeResults.filter((r) => r.passed).length,
        failed: this.smokeResults.filter((r) => !r.passed).length,
      },
      performance: {
        total: this.perfResults.length,
        regressions: this.perfResults.filter((r) => r.regression).length,
      },
      security: {
        total: this.secResults.length,
        critical: this.secResults.filter((r) => r.severity === 'critical' && !r.passed).length,
        high: this.secResults.filter((r) => r.severity === 'high' && !r.passed).length,
      },
    };
  }
}

// --- Default Security Tests ---

export const DEFAULT_SECURITY_TESTS: Array<{
  test: string;
  category: string;
  severity: SecurityTestResult['severity'];
}> = [
  { test: 'XSS injection in chat input', category: 'XSS', severity: 'critical' },
  { test: 'SQL injection in search query', category: 'Injection', severity: 'critical' },
  { test: 'CSRF token validation', category: 'CSRF', severity: 'high' },
  { test: 'API key exposure in client bundle', category: 'Secrets', severity: 'critical' },
  { test: 'CORS policy restricts origins', category: 'CORS', severity: 'high' },
  { test: 'Rate limiting on API endpoints', category: 'DoS', severity: 'medium' },
  { test: 'Path traversal in file operations', category: 'Injection', severity: 'high' },
  { test: 'Authentication bypass check', category: 'Auth', severity: 'critical' },
  { test: 'Dependency vulnerability scan', category: 'Dependencies', severity: 'medium' },
  { test: 'Secure headers (CSP, HSTS)', category: 'Headers', severity: 'low' },
];
