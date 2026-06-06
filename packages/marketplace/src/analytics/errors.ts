// ==============================================================================
// GHITA CODING AGENT - Error Analytics (Phase 39)
// ==============================================================================

import { createHash } from 'node:crypto';
import type { PluginError } from './types.js';

/**
 * Ingests plugin error reports, groups by fingerprint, tracks affected users.
 */
export class ErrorAnalytics {
  private errors = new Map<string, PluginError>(); // fingerprint → error
  private byProduct = new Map<string, Set<string>>();

  /**
   * Record an error.
   */
  record(opts: { productId: string; message: string; stack?: string; userId: string; timestamp?: number }): PluginError {
    const fp = this.fingerprint(opts.message, opts.stack);
    const ts = opts.timestamp ?? Date.now();
    let err = this.errors.get(fp);
    if (err) {
      err.count++;
      err.lastSeen = ts;
      err.affectedUsers.add(opts.userId);
    } else {
      err = {
        id: `err_${ts}_${Math.random().toString(36).slice(2, 8)}`,
        productId: opts.productId,
        fingerprint: fp,
        message: opts.message,
        stack: opts.stack,
        count: 1,
        firstSeen: ts,
        lastSeen: ts,
        affectedUsers: new Set([opts.userId]),
        resolved: false,
      };
      this.errors.set(fp, err);
    }
    if (!this.byProduct.has(opts.productId)) this.byProduct.set(opts.productId, new Set());
    this.byProduct.get(opts.productId)?.add(fp);
    return err;
  }

  /**
   * Get an error by fingerprint.
   */
  get(fingerprint: string): PluginError | undefined {
    return this.errors.get(fingerprint);
  }

  /**
   * List errors for a product, sorted by last seen desc.
   */
  listForProduct(productId: string, limit = 50): PluginError[] {
    const fps = this.byProduct.get(productId) ?? new Set();
    return Array.from(fps)
      .flatMap((fp) => this.errors.get(fp) ?? [])
      .filter(Boolean)
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit);
  }

  /**
   * Mark an error as resolved.
   */
  resolve(fingerprint: string): boolean {
    const e = this.errors.get(fingerprint);
    if (!e) return false;
    e.resolved = true;
    return true;
  }

  /**
   * Error rate (errors per minute) over a window.
   */
  errorRate(productId: string, windowMs: number): number {
    const now = Date.now();
    const fps = this.byProduct.get(productId) ?? new Set();
    let count = 0;
    for (const fp of fps) {
      const e = this.errors.get(fp);
      if (e && e.lastSeen >= now - windowMs) count += e.count;
    }
    return (count / windowMs) * 60_000;
  }

  /**
   * Generate a stable fingerprint from message + top stack frames.
   */
  fingerprint(message: string, stack?: string): string {
    const frames = (stack ?? '').split('\n').slice(0, 3).join('|');
    return createHash('sha1').update(`${message}::${frames}`).digest('hex').slice(0, 16);
  }
}
