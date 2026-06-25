// ==============================================================================
// GHITA CODING AGENT - Bug Report Template & Tracker (Phase 40)
// ==============================================================================

import { randomUUID } from 'node:crypto';
import type { BugReport } from './types.js';

/**
 * Captures structured bug reports with a guided template.
 */
export class BugReportTracker {
  private reports = new Map<string, BugReport>();
  private byProduct = new Map<string, Set<string>>();

  /**
   * Create a new bug report. The template is enforced by typed arguments.
   */
  create(opts: {
    productId: string;
    reporterId: string;
    title: string;
    description: string;
    steps: string[];
    expected: string;
    actual: string;
    environment: { os: string; productVersion: string; runtime?: string };
    severity?: BugReport['severity'];
    attachments?: string[];
  }): BugReport {
    if (opts.steps.length === 0) {
      throw new Error('At least one reproduction step is required');
    }
    const r: BugReport = {
      id: `bug_${randomUUID()}`,
      productId: opts.productId,
      reporterId: opts.reporterId,
      title: opts.title,
      description: opts.description,
      steps: opts.steps,
      expected: opts.expected,
      actual: opts.actual,
      environment: opts.environment,
      severity: opts.severity ?? 'medium',
      status: 'open',
      attachments: opts.attachments ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.reports.set(r.id, r);
    if (!this.byProduct.has(opts.productId)) this.byProduct.set(opts.productId, new Set());
    this.byProduct.get(opts.productId)?.add(r.id);
    return r;
  }

  /**
   * Update status.
   */
  updateStatus(id: string, status: BugReport['status']): BugReport {
    const r = this.getOrThrow(id);
    r.status = status;
    r.updatedAt = Date.now();
    return r;
  }

  /**
   * List reports for a product.
   */
  listForProduct(
    productId: string,
    filter?: { status?: BugReport['status']; severity?: BugReport['severity'] },
  ): BugReport[] {
    const ids = this.byProduct.get(productId) ?? new Set();
    return Array.from(ids)
      .flatMap((id) => this.reports.get(id) ?? [])
      .filter(Boolean)
      .filter((r) => (filter?.status ? r.status === filter.status : true))
      .filter((r) => (filter?.severity ? r.severity === filter.severity : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Render the standard bug-report template (markdown).
   */
  template(): string {
    return [
      '## Bug Report',
      '',
      '**Title:** [short summary]',
      '',
      '**Description:**',
      '[What happened?]',
      '',
      '**Steps to Reproduce:**',
      '1. [first step]',
      '2. [second step]',
      '3. [see error]',
      '',
      '**Expected:** [what should have happened]',
      '',
      '**Actual:** [what actually happened]',
      '',
      '**Environment:**',
      '- OS: [e.g. Windows 11]',
      '- Plugin version: [e.g. 1.2.3]',
      '- GHITA version: [e.g. 0.0.3]',
      '- Runtime: [e.g. Node 22]',
      '',
      '**Severity:** [low | medium | high | critical]',
      '',
      '**Attachments:** [logs, screenshots]',
    ].join('\n');
  }

  private getOrThrow(id: string): BugReport {
    const r = this.reports.get(id);
    if (!r) throw new Error(`Bug report not found: ${id}`);
    return r;
  }
}
