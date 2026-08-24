import type { DiscoveryConfig } from './types.js';
import { ModelDiscovery } from './model-discovery.js';

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ProviderHealth {
  provider: string;
  status: HealthStatus;
  latencyMs: number;
  lastCheckAt: number;
  lastError?: string;
  consecutiveFailures: number;
  modelCount: number;
  circuitState: 'closed' | 'open' | 'half-open';
  circuitOpenedAt?: number;
}

export interface HealthConfig {
  /** Ping interval (ms) */
  intervalMs: number;
  /** Per-probe timeout (ms) */
  probeTimeoutMs: number;
  /** Consecutive failures → open circuit */
  failureThreshold: number;
  /** Time after which half-open allows test request (ms) */
  circuitResetMs: number;
  /** Latency > degradedThreshold → status degraded */
  degradedThresholdMs: number;
  /** Number of probes per cycle */
  probesPerCycle: number;
}

const DEFAULT_CONFIG: HealthConfig = {
  intervalMs: 60_000,
  probeTimeoutMs: 5_000,
  failureThreshold: 3,
  circuitResetMs: 30_000,
  degradedThresholdMs: 2_000,
  probesPerCycle: 1,
};

export class ProviderHealthCheck {
  private config: HealthConfig;
  private discovery: ModelDiscovery;
  private health = new Map<string, ProviderHealth>();
  private configs = new Map<string, DiscoveryConfig>();
  private listeners = new Set<(h: ProviderHealth) => void>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(discovery: ModelDiscovery, config: Partial<HealthConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.discovery = discovery;
  }

  /** Register a provider for health tracking */
  registerProvider(config: DiscoveryConfig): void {
    this.configs.set(config.providerType, config);
    if (!this.health.has(config.providerType)) {
      this.health.set(config.providerType, {
        provider: config.providerType,
        status: 'unknown',
        latencyMs: 0,
        lastCheckAt: 0,
        consecutiveFailures: 0,
        modelCount: 0,
        circuitState: 'closed',
      });
    }
  }

  /** Remove provider */
  unregisterProvider(providerType: string): void {
    this.configs.delete(providerType);
    this.health.delete(providerType);
  }

  /** Get current health for a provider */
  getHealth(providerType: string): ProviderHealth | null {
    return this.health.get(providerType) ?? null;
  }

  /** Get health for all registered providers */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.health.values());
  }

  /** Start periodic health checks */
  start(): void {
    if (this.intervalHandle) return;
    void this.runCycle();
    this.intervalHandle = setInterval(() => {
      void this.runCycle();
    }, this.config.intervalMs);
    if (this.intervalHandle && typeof this.intervalHandle === 'object' && 'unref' in this.intervalHandle) {
      this.intervalHandle.unref();
    }
  }

  /** Stop periodic health checks */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Run a single health-check cycle for all providers (parallel) */
  async runCycle(): Promise<ProviderHealth[]> {
    const providers = Array.from(this.configs.values());
    const probes = providers.map((c) => this.probe(c));
    const results = await Promise.allSettled(probes);
    return results
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .filter((h): h is ProviderHealth => h !== null);
  }

  /** Probe a single provider */
  async probe(config: DiscoveryConfig): Promise<ProviderHealth> {
    const provider = config.providerType;
    const existing = this.health.get(provider);
    const start = Date.now();
    const probes: Array<{ ok: boolean; latencyMs: number; error?: string; models?: number }> = [];

    // Circuit breaker check
    if (existing?.circuitState === 'open') {
      const elapsed = Date.now() - (existing.circuitOpenedAt ?? 0);
      if (elapsed < this.config.circuitResetMs) {
        return existing;
      }
      existing.circuitState = 'half-open';
    }

    for (let i = 0; i < this.config.probesPerCycle; i++) {
      try {
        const cached = this.discovery.getCachedModels(provider);
        if (cached && Date.now() - cached.fetchedAt < cached.ttl) {
          probes.push({ ok: true, latencyMs: 0, models: cached.models.length });
          break;
        }
        const result = await this.probeModels(config);
        probes.push(result);
        if (result.ok) break;
      } catch (err) {
        probes.push({
          ok: false,
          latencyMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const last = probes[probes.length - 1];
    const allOk = probes.length > 0 && probes.every((p) => p.ok);
    const health: ProviderHealth = {
      provider,
      status: 'unknown',
      latencyMs: last?.latencyMs ?? 0,
      lastCheckAt: Date.now(),
      consecutiveFailures: 0,
      modelCount: last?.models ?? existing?.modelCount ?? 0,
      circuitState: 'closed',
    };

    if (!allOk) {
      health.consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;
      health.lastError = last?.error;
      if (health.consecutiveFailures >= this.config.failureThreshold) {
        health.status = 'down';
        health.circuitState = 'open';
        health.circuitOpenedAt = Date.now();
      } else {
        health.status = 'degraded';
      }
    } else {
      health.status =
        last && last.latencyMs > this.config.degradedThresholdMs ? 'degraded' : 'healthy';
      if (existing?.circuitState === 'half-open') {
        health.circuitState = 'closed';
      }
    }

    this.health.set(provider, health);
    for (const listener of this.listeners) {
      try {
        listener(health);
      } catch {
        // swallow
      }
    }
    return health;
  }

  /** Subscribe to health updates */
  subscribe(listener: (h: ProviderHealth) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Force reset circuit breaker for a provider */
  resetCircuit(provider: string): boolean {
    const h = this.health.get(provider);
    if (!h) return false;
    h.circuitState = 'closed';
    h.circuitOpenedAt = undefined;
    h.consecutiveFailures = 0;
    return true;
  }

  /** Get aggregate stats */
  getStats(): {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    unknown: number;
    circuitsOpen: number;
  } {
    const stats = { total: 0, healthy: 0, degraded: 0, down: 0, unknown: 0, circuitsOpen: 0 };
    for (const h of this.health.values()) {
      stats.total++;
      stats[h.status]++;
      if (h.circuitState === 'open') stats.circuitsOpen++;
    }
    return stats;
  }

  // --- Private ---

  private async probeModels(
    config: DiscoveryConfig,
  ): Promise<{ ok: boolean; latencyMs: number; models?: number; error?: string }> {
    const start = Date.now();
    const url = `${config.baseUrl.replace(/\/$/, '')}/models`;
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      if (config.authStyle === 'bearer') headers['Authorization'] = `Bearer ${config.apiKey}`;
      else if (config.authStyle === 'x-api-key') {
        headers['x-api-key'] = config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      }
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.probeTimeoutMs);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}` };
      }
      const data = await res.json().catch(() => null);
      let modelCount = 0;
      if (data && typeof data === 'object') {
        const d = data as { data?: unknown[]; models?: unknown[]; results?: unknown[] };
        modelCount = d.data?.length ?? d.models?.length ?? d.results?.length ?? 0;
      }
      return { ok: true, latencyMs, models: modelCount };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Singleton helper

let _defaultHealth: ProviderHealthCheck | null = null;

export function getDefaultHealthCheck(discovery?: ModelDiscovery): ProviderHealthCheck {
  if (!_defaultHealth) {
    _defaultHealth = new ProviderHealthCheck(discovery ?? new ModelDiscovery());
  }
  return _defaultHealth;
}
