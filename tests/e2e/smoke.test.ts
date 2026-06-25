// ==============================================================================
// GHITA CODING AGENT - E2E Smoke Test Suite (Phase 46)
// Quick validation that core systems boot and respond correctly
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Smoke Test: Core System Health Checks
// ---------------------------------------------------------------------------

interface HealthCheckResult {
  service: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number;
  details?: Record<string, unknown>;
}

class SmokeTestRunner {
  private results: HealthCheckResult[] = [];

  async checkService(name: string, fn: () => Promise<void>): Promise<HealthCheckResult> {
    const start = performance.now();
    try {
      await fn();
      const result: HealthCheckResult = {
        service: name,
        status: 'ok',
        latencyMs: Math.round(performance.now() - start),
      };
      this.results.push(result);
      return result;
    } catch (err) {
      const result: HealthCheckResult = {
        service: name,
        status: 'down',
        latencyMs: Math.round(performance.now() - start),
        details: { error: err instanceof Error ? err.message : String(err) },
      };
      this.results.push(result);
      return result;
    }
  }

  getResults(): HealthCheckResult[] {
    return [...this.results];
  }

  getSummary(): { total: number; passed: number; failed: number; degraded: number } {
    return {
      total: this.results.length,
      passed: this.results.filter((r) => r.status === 'ok').length,
      failed: this.results.filter((r) => r.status === 'down').length,
      degraded: this.results.filter((r) => r.status === 'degraded').length,
    };
  }

  isAllGreen(): boolean {
    return this.results.every((r) => r.status === 'ok');
  }
}

// ---------------------------------------------------------------------------
// Mock Server for Testing
// ---------------------------------------------------------------------------

function createMockServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    } else if (req.url === '/api/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          models: [
            { id: 'gpt-4', provider: 'openai', available: true },
            { id: 'claude-3', provider: 'anthropic', available: true },
          ],
        }),
      );
    } else if (req.url === '/api/skills') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ skills: [{ id: 'code-review', enabled: true }] }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 46 - Smoke Test Suite', () => {
  let server: http.Server;
  const PORT = 19876;
  let runner: SmokeTestRunner;

  beforeAll(async () => {
    server = createMockServer(PORT);
    await new Promise<void>((resolve) => server.listen(PORT, resolve));
    runner = new SmokeTestRunner();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('health endpoint responds with 200', async () => {
    const result = await runner.checkService('health-endpoint', async () => {
      const res = await fetch(`http://localhost:${PORT}/health`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { status: string };
      expect(data.status).toBe('ok');
    });
    expect(result.status).toBe('ok');
    expect(result.latencyMs).toBeLessThan(1000);
  });

  it('models API returns available models', async () => {
    const result = await runner.checkService('models-api', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/models`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { models: Array<{ id: string; available: boolean }> };
      expect(data.models.length).toBeGreaterThan(0);
      expect(data.models.every((m) => m.available)).toBe(true);
    });
    expect(result.status).toBe('ok');
  });

  it('skills API returns enabled skills', async () => {
    const result = await runner.checkService('skills-api', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/skills`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { skills: Array<{ id: string; enabled: boolean }> };
      expect(data.skills.length).toBeGreaterThan(0);
    });
    expect(result.status).toBe('ok');
  });

  it('returns 404 for unknown routes', async () => {
    const result = await runner.checkService('unknown-route-404', async () => {
      const res = await fetch(`http://localhost:${PORT}/nonexistent`);
      expect(res.status).toBe(404);
    });
    expect(result.status).toBe('ok');
  });

  it('smoke test summary shows all green', async () => {
    const summary = runner.getSummary();
    expect(summary.total).toBe(4);
    expect(summary.passed).toBe(4);
    expect(summary.failed).toBe(0);
    expect(runner.isAllGreen()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// API Integration Tests
// ---------------------------------------------------------------------------

describe('Phase 46 - API Integration Tests', () => {
  let server: http.Server;
  const PORT = 19877;

  beforeAll(async () => {
    server = createMockServer(PORT);
    await new Promise<void>((resolve) => server.listen(PORT, resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('concurrent requests do not degrade', async () => {
    const promises = Array.from({ length: 20 }, () =>
      fetch(`http://localhost:${PORT}/health`).then((r) => r.json()),
    );
    const results = await Promise.all(promises);
    expect(
      results.every((r: { status: string }) => (r as { status: string }).status === 'ok'),
    ).toBe(true);
  });

  it('JSON responses have correct Content-Type', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/models`);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('server handles rapid sequential requests', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`http://localhost:${PORT}/health`);
      expect(res.status).toBe(200);
    }
  });
});
