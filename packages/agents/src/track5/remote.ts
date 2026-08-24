// Data layer for mobile remote control: lists running jobs, allows resume/
// approve decisions from the phone (the desktop app consumes these events).

import type { AgentLifecycleManager, ManagedRun } from './lifecycle.js';

export interface RemoteJob {
  id: string;
  name: string;
  state: ManagedRun['state'];
  progress?: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

export interface RemoteAction {
  jobId: string;
  action: 'resume' | 'cancel' | 'approve';
  payload?: unknown;
}

export class RemoteJobStatusProvider {
  private actions: RemoteAction[] = [];

  constructor(private readonly lifecycle: AgentLifecycleManager) {}

  /** Snapshot of all jobs for the mobile dashboard. */
  listJobs(): RemoteJob[] {
    return this.lifecycle.enumerate().map((r) => ({
      id: r.id,
      name: r.name,
      state: r.state,
      progress: r.progress,
      startedAt: r.startedAt,
      updatedAt: r.updatedAt,
      error: r.error,
    }));
  }

  /** Apply a remote action (from the phone) to the desktop runtime. */
  applyAction(action: RemoteAction): { ok: boolean; reason: string } {
    this.actions.push(action);
    switch (action.action) {
      case 'resume': {
        const ok = this.lifecycle.resume(action.jobId);
        return ok ? { ok, reason: 'resumed' } : { ok, reason: 'job is not paused or unknown' };
      }
      case 'cancel': {
        const ok = this.lifecycle.cancel(action.jobId);
        return ok ? { ok, reason: 'cancelled' } : { ok, reason: 'job not cancellable or unknown' };
      }
      case 'approve':
        // Approval payloads are forwarded to the HITL/approval layer by the consumer.
        return { ok: true, reason: 'approval queued' };
      default:
        return { ok: false, reason: `unknown action: ${String(action.action)}` };
    }
  }

  recentActions(limit = 20): RemoteAction[] {
    return this.actions.slice(-limit);
  }
}
