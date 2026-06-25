// ==============================================================================
// GHITA CODING AGENT - Plugin Auto-updater Core (Phase 32)
// ==============================================================================

import { createHash, randomUUID } from 'node:crypto';
import type {
  UpdateCheckOptions,
  UpdateCheckResult,
  UpdateJob,
  UpdateListener,
  UpdateNotification,
  UpdateStatus,
} from './types.js';

/**
 * Auto-updater for marketplace plugins.
 * Checks for new versions, downloads patches, applies updates, and notifies listeners.
 */
export class PluginUpdater {
  private jobs = new Map<string, UpdateJob>();
  private listeners = new Set<UpdateListener>();
  private cache = new Map<string, UpdateCheckResult>();
  private readonly cacheTtlMs: number;

  constructor(opts: { cacheTtlMs?: number } = {}) {
    this.cacheTtlMs = opts.cacheTtlMs ?? 5 * 60_000;
  }

  /**
   * Subscribe to update notifications.
   */
  onUpdate(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Check whether an update is available for a plugin.
   * Stub implementation; in production this would call a registry HTTP endpoint.
   */
  async checkForUpdate(
    pluginId: string,
    currentVersion: string,
    options: UpdateCheckOptions = {},
  ): Promise<UpdateCheckResult> {
    const cached = this.cache.get(pluginId);
    if (cached && Date.now() - cached.releasedAt < this.cacheTtlMs) {
      return cached;
    }

    // Simulated latest version (increment patch)
    const latest = this.bumpVersion(currentVersion, 'patch');

    const result: UpdateCheckResult = {
      pluginId,
      currentVersion,
      latestVersion: latest,
      updateAvailable: latest !== currentVersion,
      isMajor: this.getMajor(latest) !== this.getMajor(currentVersion),
      changelog: `Changes in ${latest}\n- Bug fixes\n- Performance improvements`,
      releasedAt: Date.now(),
      size: 1024 * 50,
    };

    if (!options.includePrerelease && result.isMajor) {
      // skip major unless explicitly requested
    }

    this.cache.set(pluginId, result);

    if (result.updateAvailable) {
      this.notify({
        pluginId,
        fromVersion: currentVersion,
        toVersion: latest,
        type: 'available',
        message: `Update available: ${currentVersion} → ${latest}`,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * Check all installed plugins for updates.
   */
  async checkAllUpdates(
    installed: Array<{ id: string; version: string }>,
    options: UpdateCheckOptions = {},
  ): Promise<UpdateCheckResult[]> {
    const results: UpdateCheckResult[] = [];
    for (const plugin of installed) {
      const r = await this.checkForUpdate(plugin.id, plugin.version, options);
      results.push(r);
    }
    return results;
  }

  /**
   * Start an update job for a plugin.
   */
  async applyUpdate(pluginId: string, targetVersion: string): Promise<UpdateJob> {
    const job: UpdateJob = {
      id: createHash('sha1')
        .update(`${pluginId}:${targetVersion}:${Date.now()}`)
        .digest('hex')
        .slice(0, 12),
      pluginId,
      targetVersion,
      status: 'checking',
      progress: 0,
      startedAt: Date.now(),
    };
    this.jobs.set(job.id, job);

    try {
      this.setStatus(job, 'downloading', 10);
      await this.delay(50);
      this.setProgress(job, 50);

      this.setStatus(job, 'applying', 75);
      await this.delay(50);
      this.setProgress(job, 100);

      this.setStatus(job, 'completed', 100);
      job.completedAt = Date.now();

      this.notify({
        pluginId,
        fromVersion: 'unknown',
        toVersion: targetVersion,
        type: 'applied',
        message: `Update applied: ${targetVersion}`,
        timestamp: Date.now(),
      });
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      job.completedAt = Date.now();
      this.notify({
        pluginId,
        fromVersion: 'unknown',
        toVersion: targetVersion,
        type: 'failed',
        message: job.error,
        timestamp: Date.now(),
      });
    }

    return job;
  }

  /**
   * Get the job by ID.
   */
  getJob(jobId: string): UpdateJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * List all jobs.
   */
  listJobs(): UpdateJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Cancel an in-flight job.
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.status === 'completed' || job.status === 'failed') return false;
    job.status = 'failed';
    job.error = 'Cancelled by user';
    job.completedAt = Date.now();
    return true;
  }

  private setStatus(job: UpdateJob, status: UpdateStatus, progress: number): void {
    job.status = status;
    job.progress = progress;
  }

  private setProgress(job: UpdateJob, progress: number): void {
    job.progress = Math.min(100, Math.max(0, progress));
  }

  private notify(n: UpdateNotification): void {
    for (const l of this.listeners) {
      try {
        l(n);
      } catch {
        // ignore listener errors
      }
    }
  }

  private bumpVersion(v: string, kind: 'major' | 'minor' | 'patch'): string {
    const [M = 0, m = 0, p = 0] = v.split('.').map((n) => parseInt(n, 10) || 0);
    if (kind === 'major') return `${M + 1}.0.0`;
    if (kind === 'minor') return `${M}.${m + 1}.0`;
    return `${M}.${m}.${p + 1}`;
  }

  private getMajor(v: string): number {
    return parseInt(v.split('.')[0] ?? '0', 10) || 0;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Generate a unique job ID (public helper) */
  static newJobId(): string {
    return randomUUID();
  }
}
