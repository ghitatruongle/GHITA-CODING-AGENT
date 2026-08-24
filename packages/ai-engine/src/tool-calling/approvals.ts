export type ApprovalDecision = 'approved' | 'denied';

export type SessionDefault = 'ask' | 'approve-all' | 'deny-all';

export interface PendingToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  requestedAt: number;
}

export interface ApprovalRequest {
  call: PendingToolCall;
  role: string;
  state: 'pending' | 'approved' | 'denied';
  decidedAt?: number;
  decidedBy?: string;
}

export interface ToolApprovalManagerOptions {
  /** Session default per role (default: deny-all for unknown roles). */
  sessionDefaults?: Record<string, SessionDefault>;
  /** How long a pending request waits for a decision (ms). */
  timeoutMs?: number;
}

export class ToolApprovalManager {
  private requests = new Map<string, ApprovalRequest>();
  private readonly defaults: Record<string, SessionDefault>;
  private readonly timeoutMs: number;

  constructor(options: ToolApprovalManagerOptions = {}) {
    this.defaults = options.sessionDefaults ?? {};
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  request(
    name: string,
    args: Record<string, unknown>,
    role = 'default',
    id?: string,
  ): ApprovalRequest {
    const call: PendingToolCall = {
      id: id ?? `tc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      args,
      requestedAt: Date.now(),
    };
    const req: ApprovalRequest = { call, role, state: 'pending' };
    this.requests.set(call.id, req);

    // Auto-decide only when the session default explicitly says so.
    // Unknown roles default to "ask" — execution still requires approval
    // (deny-default via `canExecute`).
    const sessionDefault = this.defaults[role] ?? 'ask';
    if (sessionDefault === 'approve-all') this.approve(call.id, 'session-default');
    else if (sessionDefault === 'deny-all') this.deny(call.id, 'session-default');

    return req;
  }

  approve(id: string, by = 'user'): boolean {
    const req = this.requests.get(id);
    if (!req || req.state !== 'pending') return false;
    req.state = 'approved';
    req.decidedAt = Date.now();
    req.decidedBy = by;
    return true;
  }

  deny(id: string, by = 'user'): boolean {
    const req = this.requests.get(id);
    if (!req || req.state !== 'pending') return false;
    req.state = 'denied';
    req.decidedAt = Date.now();
    req.decidedBy = by;
    return true;
  }

  /** Await a decision for one call (with timeout). */
  async awaitDecision(id: string): Promise<ApprovalRequest> {
    const existing = this.requests.get(id);
    if (!existing) throw new Error(`unknown tool call: ${id}`);
    if (existing.state !== 'pending') return existing;

    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const req = this.requests.get(id);
        if (req && req.state !== 'pending') {
          clearInterval(timer);
          resolve(req);
        } else if (Date.now() - started > this.timeoutMs) {
          clearInterval(timer);
          this.deny(id, 'timeout');
          const denied = this.requests.get(id);
          if (denied !== undefined) resolve(denied);
        }
      }, 25);
    });
  }

  /** Approve/deny the whole collected batch (Accept All / Reject All). */
  decideAll(decision: ApprovalDecision, by = 'user'): number {
    let changed = 0;
    for (const req of this.requests.values()) {
      if (req.state !== 'pending') continue;
      if (decision === 'approved') this.approve(req.call.id, by);
      else this.deny(req.call.id, by);
      changed += 1;
    }
    return changed;
  }

  pending(): ApprovalRequest[] {
    return [...this.requests.values()].filter((r) => r.state === 'pending');
  }

  get(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  list(): ApprovalRequest[] {
    return [...this.requests.values()];
  }

  clear(): void {
    this.requests.clear();
  }
}

/** Decide whether a call may execute given its request state (deny-default). */
export function canExecute(
  req: ApprovalRequest | undefined,
): req is ApprovalRequest & { state: 'approved' } {
  return Boolean(req && req.state === 'approved');
}
