// Periodically probes each provider's /models endpoint to track health state.

import type {
  HealthCheckConfig,
  HealthSnapshot,
  HealthState,
  LoadBalancedAdapter,
  LoadBalancedProvider,
} from './types.js';
import { DEFAULT_HEALTH_CONFIG } from './types.js';

// Health Checker

export class HealthChecker {
  private config: Required<HealthCheckConfig>;
  private snapshots: Map<string, HealthSnapshot> = new Map();
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private listeners: Array<(snapshot: HealthSnapshot) => void> = [];
  private onStateChange: (providerId: string, state: HealthState, previous: HealthState) => void;

  constructor(
    config: Partial<HealthCheckConfig>,
    onStateChange: (providerId: string, state: HealthState, previous: HealthState) => void,
  ) {
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
    this.onStateChange = onStateChange;
  }

  /** Start health checks for a single provider. */
  start(provider: LoadBalancedProvider, adapter: LoadBalancedAdapter): void {
    if (!this.config.enabled) return;
    if (this.intervals.has(provider.id)) return;

    // Initialize snapshot
    this.snapshots.set(provider.id, {
      providerId: provider.id,
      state: 'unknown',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastLatencyMs: null,
      averageLatencyMs: 0,
    });

    // Run an immediate probe
    void this.probe(provider, adapter);

    const timer = setInterval(() => {
      void this.probe(provider, adapter);
    }, this.config.intervalMs);
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
    this.intervals.set(provider.id, timer);
  }

  /** Stop health checks for a single provider. */
  stop(providerId: string): void {
    const t = this.intervals.get(providerId);
    if (t) {
      clearInterval(t);
      this.intervals.delete(providerId);
    }
    this.snapshots.delete(providerId);
  }

  /** Stop all health checks. */
  stopAll(): void {
    for (const [id] of this.intervals) this.stop(id);
  }

  /** Manually trigger a probe (used by load balancer on demand). */
  async probeNow(
    provider: LoadBalancedProvider,
    adapter: LoadBalancedAdapter,
  ): Promise<HealthSnapshot> {
    await this.probe(provider, adapter);
    return this.getSnapshot(provider.id) as HealthSnapshot;
  }

  /** Get current snapshot for a provider. */
  getSnapshot(providerId: string): HealthSnapshot | null {
    const s = this.snapshots.get(providerId);
    return s ? { ...s } : null;
  }

  /** Get all snapshots. */
  getAllSnapshots(): HealthSnapshot[] {
    return Array.from(this.snapshots.values()).map((s) => ({ ...s }));
  }

  /** Subscribe to snapshot updates. */
  onUpdate(listener: (snapshot: HealthSnapshot) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Compute the current state based on consecutive success/fail thresholds. */
  static computeState(
    consecutiveSuccesses: number,
    consecutiveFailures: number,
    successThreshold: number,
    failureThreshold: number,
  ): HealthState {
    if (consecutiveFailures >= failureThreshold) return 'unhealthy';
    if (consecutiveSuccesses >= successThreshold) return 'healthy';
    if (consecutiveFailures > 0) return 'degraded';
    return 'unknown';
  }

  // --- Internals ---------------------------------------------------------

  private async probe(provider: LoadBalancedProvider, adapter: LoadBalancedAdapter): Promise<void> {
    const snapshot = this.snapshots.get(provider.id);
    if (!snapshot) return;

    const prevState = snapshot.state;
    const t0 = Date.now();

    try {
      if (adapter.healthCheck) {
        await this.withTimeout(adapter.healthCheck(this.config.timeoutMs), this.config.timeoutMs);
      } else if (provider.baseUrl) {
        // Default probe: GET /models (or configured endpoint) on provider base URL
        const url = new URL(this.config.endpoint, provider.baseUrl).toString();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.config.timeoutMs);
        try {
          const headers: Record<string, string> = {
            ...this.config.headers,
          };
          if (provider.apiKey) {
            headers['Authorization'] = `Bearer ${provider.apiKey}`;
          }
          const resp = await fetch(url, {
            method: this.config.method,
            headers,
            signal: ctrl.signal,
          });
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }
        } finally {
          clearTimeout(timer);
        }
      } else {
        // No baseUrl and no healthCheck adapter — treat as healthy by default
      }

      const latency = Date.now() - t0;
      snapshot.consecutiveSuccesses++;
      snapshot.consecutiveFailures = 0;
      snapshot.lastSuccessAt = Date.now();
      snapshot.lastCheckedAt = Date.now();
      snapshot.lastLatencyMs = latency;
      snapshot.averageLatencyMs =
        snapshot.averageLatencyMs === 0 ? latency : snapshot.averageLatencyMs * 0.7 + latency * 0.3;
      snapshot.state = HealthChecker.computeState(
        snapshot.consecutiveSuccesses,
        snapshot.consecutiveFailures,
        this.config.successThreshold,
        this.config.failureThreshold,
      );
    } catch (err) {
      snapshot.consecutiveFailures++;
      snapshot.consecutiveSuccesses = 0;
      snapshot.lastFailureAt = Date.now();
      snapshot.lastCheckedAt = Date.now();
      snapshot.lastError = err instanceof Error ? err.message : String(err);
      snapshot.state = HealthChecker.computeState(
        snapshot.consecutiveSuccesses,
        snapshot.consecutiveFailures,
        this.config.successThreshold,
        this.config.failureThreshold,
      );
    }

    if (snapshot.state !== prevState) {
      this.onStateChange(snapshot.providerId, snapshot.state, prevState);
    }

    for (const l of this.listeners) {
      try {
        l(snapshot);
      } catch {
        /* swallow */
      }
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Health check timeout')), ms);
      if (timer && typeof timer === 'object' && 'unref' in timer) timer.unref();
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }
}
