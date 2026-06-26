// ==============================================================================
// GHITA CODING AGENT — Opt-in Usage Telemetry (v0.0.5)
// Local-only telemetry: all data stays on the user's machine.
// ==============================================================================

export interface TelemetryEvent {
  /** Event name (e.g. 'agent.run', 'skill.execute', 'chat.send') */
  name: string;
  /** Event category */
  category: 'agent' | 'skill' | 'chat' | 'file' | 'terminal' | 'browser' | 'system';
  /** Event timestamp */
  timestamp: number;
  /** Optional duration in ms (for timed events) */
  durationMs?: number;
  /** Optional success flag */
  success?: boolean;
  /** Optional metadata (no PII, no API keys) */
  meta?: Record<string, string | number | boolean>;
}

export interface TelemetryConfig {
  /** Enable/disable telemetry collection */
  enabled: boolean;
  /** Maximum events to retain in memory */
  maxEvents?: number;
  /** Optional file path for persistent storage */
  storagePath?: string;
}

/**
 * Local-only usage telemetry. All data stays on the user's machine.
 * No cloud calls, no PII collection, no API keys.
 *
 * Tracks feature usage patterns to help prioritize development.
 */
export class UsageTelemetry {
  private events: TelemetryEvent[] = [];
  private enabled: boolean;
  private maxEvents: number;

  constructor(config: TelemetryConfig = { enabled: false }) {
    this.enabled = config.enabled;
    this.maxEvents = config.maxEvents ?? 10_000;
  }

  /** Enable or disable telemetry collection */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Check if telemetry is enabled */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Record a telemetry event */
  track(event: Omit<TelemetryEvent, 'timestamp'>): void {
    if (!this.enabled) return;
    this.events.push({ ...event, timestamp: Date.now() });
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
  }

  /** Track a timed operation */
  async trackTimed<T>(
    name: string,
    category: TelemetryEvent['category'],
    fn: () => Promise<T>,
    meta?: Record<string, string | number | boolean>,
  ): Promise<T> {
    if (!this.enabled) return fn();
    const start = Date.now();
    let success = true;
    try {
      return await fn();
    } catch (err) {
      success = false;
      throw err;
    } finally {
      this.track({ name, category, durationMs: Date.now() - start, success, meta });
    }
  }

  /** Get all recorded events */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  /** Get events by category */
  getEventsByCategory(category: TelemetryEvent['category']): TelemetryEvent[] {
    return this.events.filter((e) => e.category === category);
  }

  /** Get usage summary (no raw events) */
  summary(): Record<string, { count: number; avgDurationMs: number; successRate: number }> {
    const groups = new Map<string, { total: number; duration: number; success: number }>();
    for (const e of this.events) {
      const key = `${e.category}.${e.name}`;
      const g = groups.get(key) ?? { total: 0, duration: 0, success: 0 };
      g.total++;
      g.duration += e.durationMs ?? 0;
      if (e.success) g.success++;
      groups.set(key, g);
    }
    const result: Record<string, { count: number; avgDurationMs: number; successRate: number }> =
      {};
    for (const [key, g] of groups) {
      result[key] = {
        count: g.total,
        avgDurationMs: g.total > 0 ? Math.round(g.duration / g.total) : 0,
        successRate: g.total > 0 ? Math.round((g.success / g.total) * 100) / 100 : 0,
      };
    }
    return result;
  }

  /** Clear all events */
  clear(): void {
    this.events = [];
  }
}

/** Global singleton for convenience */
let _instance: UsageTelemetry | null = null;

export function getTelemetry(): UsageTelemetry {
  _instance ??= new UsageTelemetry({ enabled: false });
  return _instance;
}

export function initTelemetry(config: TelemetryConfig): UsageTelemetry {
  _instance = new UsageTelemetry(config);
  return _instance;
}
