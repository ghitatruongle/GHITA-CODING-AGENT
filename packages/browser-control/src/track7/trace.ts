// Per-action trace records (target, before/after snapshot hashes, outcome) —
// feeds the Dashboard timeline view.

export interface ActionTrace {
  id: string;
  action: string;
  args: Record<string, unknown>;
  url: string;
  /** DOM signature before the action. */
  domBefore: string;
  /** DOM signature after the action. */
  domAfter: string;
  ok: boolean;
  /** Verifier evidence. */
  evidence: string[];
  at: number;
  durationMs: number;
}

export interface TraceStore {
  push(trace: ActionTrace): void;
  list(sessionId?: string): ActionTrace[];
  latest(): ActionTrace | undefined;
}

export class MemoryTraceStore implements TraceStore {
  private traces: ActionTrace[] = [];

  push(trace: ActionTrace): void {
    this.traces.push(trace);
    if (this.traces.length > 500) this.traces.shift();
  }

  list(): ActionTrace[] {
    return [...this.traces];
  }

  latest(): ActionTrace | undefined {
    return this.traces[this.traces.length - 1];
  }
}

export interface TimelineEvent {
  time: number;
  action: string;
  url: string;
  ok: boolean;
  durationMs: number;
}

/** Build the timeline-view model from stored traces. */
export function toTimelineView(traces: readonly ActionTrace[]): TimelineEvent[] {
  return traces.map((t) => ({
    time: t.at,
    action: t.action,
    url: t.url,
    ok: t.ok,
    durationMs: t.durationMs,
  }));
}

/** Summarize a session (success rate, top actions). */
export function summarizeTraces(traces: readonly ActionTrace[]): {
  total: number;
  ok: number;
  failed: number;
  successRate: number;
  byAction: Record<string, number>;
  avgDurationMs: number;
} {
  const total = traces.length;
  const ok = traces.filter((t) => t.ok).length;
  const byAction: Record<string, number> = {};
  let durationSum = 0;
  for (const t of traces) {
    byAction[t.action] = (byAction[t.action] ?? 0) + 1;
    durationSum += t.durationMs;
  }
  return {
    total,
    ok,
    failed: total - ok,
    successRate: total === 0 ? 0 : ok / total,
    byAction,
    avgDurationMs: total === 0 ? 0 : Math.round(durationSum / total),
  };
}
