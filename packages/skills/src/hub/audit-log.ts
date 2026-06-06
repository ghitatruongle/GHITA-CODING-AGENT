// =============================================================================
// GHITA CODING AGENT - Phase 12: Audit Log
// =============================================================================
// Records all skill operations (create, update, delete, trust changes, etc.)
// for accountability and debugging. Stored as append-only JSON array.
// =============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AuditEntry, AuditAction } from './types.js';

// --- AuditLog Class ---

export class AuditLog {
  private logPath: string;
  private entries: AuditEntry[];
  private maxEntries: number;
  private nextId: number;

  constructor(logPath: string, maxEntries: number = 1000) {
    this.logPath = logPath;
    this.maxEntries = maxEntries;
    this.entries = [];
    this.nextId = 1;
    this.load();
  }

  // --- Core Operations ---

  /**
   * Load audit log from disk.
   */
  private load(): void {
    if (fs.existsSync(this.logPath)) {
      try {
        const raw = fs.readFileSync(this.logPath, 'utf-8');
        const parsed = JSON.parse(raw) as AuditEntry[];
        this.entries = Array.isArray(parsed) ? parsed : [];
        // Find next ID
        if (this.entries.length > 0) {
          const maxId = Math.max(...this.entries.map(e => this.parseId(e.id)));
          this.nextId = maxId + 1;
        }
      } catch {
        this.entries = [];
        this.nextId = 1;
      }
    }
  }

  /**
   * Save audit log to disk.
   */
  private save(): void {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Trim to max entries (keep most recent)
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    fs.writeFileSync(this.logPath, JSON.stringify(this.entries, null, 2), 'utf-8');
  }

  /**
   * Generate next audit entry ID.
   */
  private generateId(): string {
    return `audit-${String(this.nextId++).padStart(6, '0')}`;
  }

  /**
   * Parse numeric ID from audit entry ID string.
   */
  private parseId(id: string): number {
    const match = id.match(/audit-(\d+)/);
    return match && match[1] ? parseInt(match[1], 10) : 0;
  }

  // --- Logging ---

  /**
   * Record an audit entry.
   */
  log(params: {
    action: AuditAction;
    skillId: string;
    skillVersion: string;
    actor: string;
    success: boolean;
    details?: string;
    previousHash?: string;
    newHash?: string;
    timestamp?: number;
  }): AuditEntry {
    const entry: AuditEntry = {
      id: this.generateId(),
      action: params.action,
      skillId: params.skillId,
      skillVersion: params.skillVersion,
      timestamp: params.timestamp || Date.now(),
      actor: params.actor,
      success: params.success,
      details: params.details,
      previousHash: params.previousHash,
      newHash: params.newHash,
    };

    this.entries.push(entry);
    this.save();
    return entry;
  }

  // --- Query ---

  /**
   * Get all entries (most recent last).
   */
  getAll(): ReadonlyArray<AuditEntry> {
    return this.entries;
  }

  /**
   * Get entries for a specific skill.
   */
  getBySkill(skillId: string): AuditEntry[] {
    return this.entries.filter(e => e.skillId === skillId);
  }

  /**
   * Get entries by action type.
   */
  getByAction(action: AuditAction): AuditEntry[] {
    return this.entries.filter(e => e.action === action);
  }

  /**
   * Get entries by actor.
   */
  getByActor(actor: string): AuditEntry[] {
    return this.entries.filter(e => e.actor === actor);
  }

  /**
   * Get entries within a time range.
   */
  getByTimeRange(from: number, to: number): AuditEntry[] {
    return this.entries.filter(e => e.timestamp >= from && e.timestamp <= to);
  }

  /**
   * Get the most recent N entries.
   */
  getRecent(count: number = 10): AuditEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Get failed entries only.
   */
  getFailures(): AuditEntry[] {
    return this.entries.filter(e => !e.success);
  }

  /**
   * Get the last entry for a specific skill.
   */
  getLastForSkill(skillId: string): AuditEntry | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry && entry.skillId === skillId) {
        return entry;
      }
    }
    return undefined;
  }

  // --- Stats ---

  /**
   * Get audit statistics.
   */
  stats(): {
    total: number;
    byAction: Record<AuditAction, number>;
    successRate: number;
    lastEntry?: AuditEntry;
  } {
    const byAction = {} as Record<AuditAction, number>;
    let successes = 0;

    for (const entry of this.entries) {
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
      if (entry.success) successes++;
    }

    return {
      total: this.entries.length,
      byAction,
      successRate: this.entries.length > 0 ? successes / this.entries.length : 1,
      lastEntry: this.entries[this.entries.length - 1],
    };
  }

  // --- Maintenance ---

  /**
   * Clear all audit entries.
   */
  clear(): void {
    this.entries = [];
    this.nextId = 1;
    this.save();
  }

  /**
   * Trim entries older than a given timestamp.
   */
  trim(olderThan: number): number {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.timestamp >= olderThan);
    if (this.entries.length !== before) {
      this.save();
    }
    return before - this.entries.length;
  }
}
