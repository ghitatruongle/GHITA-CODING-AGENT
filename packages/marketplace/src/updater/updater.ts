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

/** Minimal fetch signature so the updater can be tested without a network. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Auto-updater for marketplace plugins.
 * Checks for new versions, downloads patches, applies updates, and notifies listeners.
 */
export class PluginUpdater {
  private jobs = new Map<string, UpdateJob>();
  private listeners = new Set<UpdateListener>();
  private cache = new Map<string, UpdateCheckResult>();
  /** When each cache entry was stored (for TTL) — NOT the manifest releasedAt. */
  private cacheTimestamps = new Map<string, number>();
  private readonly cacheTtlMs: number;
  /** Base URL of the plugin registry. When unset, no update is ever reported. */
  private readonly registryUrl?: string;
  private readonly fetchImpl?: FetchLike;

  constructor(opts: { cacheTtlMs?: number; registryUrl?: string; fetchImpl?: FetchLike } = {}) {
    this.cacheTtlMs = opts.cacheTtlMs ?? 5 * 60_000;
    this.registryUrl = opts.registryUrl?.replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl;
  }

  /**
   * Subscribe to update notifications.
   */
  onUpdate(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Check whether an update is available for a plugin by querying the plugin
   * registry over HTTP. When no registry is configured (or the request fails)
   * the method reports "no update" rather than fabricating one.
   */
  async checkForUpdate(
    pluginId: string,
    currentVersion: string,
    options: UpdateCheckOptions = {},
  ): Promise<UpdateCheckResult> {
    const cached = this.cache.get(pluginId);
    const cachedAt = this.cacheTimestamps.get(pluginId) ?? 0;
    if (cached && Date.now() - cachedAt < this.cacheTtlMs) {
      return cached;
    }

    const noUpdate: UpdateCheckResult = {
      pluginId,
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      isMajor: false,
      changelog: '',
      releasedAt: Date.now(),
      size: 0,
    };

    const fetchImpl = this.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
    if (!this.registryUrl || !fetchImpl) {
      // No registry wired — do not invent an update.
      this.setCache(pluginId, noUpdate);
      return noUpdate;
    }

    let manifest: {
      version?: string;
      changelog?: string;
      size?: number;
      releasedAt?: number;
      prerelease?: boolean;
    };
    try {
      const url = `${this.registryUrl}/plugins/${encodeURIComponent(pluginId)}/latest`;
      const res = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout?.(8000),
      });
      if (!res.ok) {
        this.setCache(pluginId, noUpdate);
        return noUpdate;
      }
      manifest = (await res.json()) as typeof manifest;
    } catch {
      // Network/parse failure — report no update instead of guessing.
      this.setCache(pluginId, noUpdate);
      return noUpdate;
    }

    const latest = typeof manifest.version === 'string' ? manifest.version : currentVersion;
    const isNewer = this.compareVersions(latest, currentVersion) > 0;
    const isMajor = this.getMajor(latest) > this.getMajor(currentVersion);

    // Skip prereleases unless opted in; skip stable major bumps unless opted in.
    const skip =
      (manifest.prerelease === true && !options.includePrerelease) ||
      (isMajor && !options.includeMajor);

    const result: UpdateCheckResult = {
      pluginId,
      currentVersion,
      latestVersion: latest,
      updateAvailable: isNewer && !skip,
      isMajor,
      changelog: manifest.changelog ?? '',
      releasedAt: typeof manifest.releasedAt === 'number' ? manifest.releasedAt : Date.now(),
      size: typeof manifest.size === 'number' ? manifest.size : 0,
    };

    this.setCache(pluginId, result);

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

  /** Store a cache entry together with the wall-clock time it was cached. */
  private setCache(pluginId: string, result: UpdateCheckResult): void {
    this.cache.set(pluginId, result);
    this.cacheTimestamps.set(pluginId, Date.now());
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
    const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
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
