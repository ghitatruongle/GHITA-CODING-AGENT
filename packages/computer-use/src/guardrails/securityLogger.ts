// =============================================================================
// GHITA CODING AGENT - Phase 13: Security Logger (SQLite persistence)
// Ghi vết logs các câu lệnh nguy hiểm bị chặn
// =============================================================================

import Database from 'better-sqlite3';
import type { SecurityLogEntry, ThreatDetection } from './types.js';

/**
 * SecurityLogger — Lưu trữ logs bảo mật vào SQLite
 *
 * Tác vụ 7: Ghi vết logs các câu lệnh nguy hiểm bị chặn để làm bằng chứng an ninh
 */
export class SecurityLogger {
  private db: Database.Database | null = null;
  private dbPath: string;
  private telemetryLogs: Array<{
    type: string;
    action: string;
    details: Record<string, unknown>;
    status: 'success' | 'failure';
    timestamp: Date;
  }> = [];

  constructor(dbPath?: string) {
    this.dbPath = dbPath || ':memory:';
  }

  /**
   * Khởi tạo database và tạo bảng nếu chưa tồn tại
   */
  init(): void {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        safe INTEGER NOT NULL DEFAULT 0,
        approved INTEGER,
        threats_json TEXT NOT NULL DEFAULT '[]',
        error_code TEXT,
        source TEXT NOT NULL DEFAULT 'local',
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp
        ON security_logs(timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_security_logs_safe
        ON security_logs(safe);
    `);
  }

  /**
   * Ghi một security log entry vào SQLite
   */
  log(entry: SecurityLogEntry): void {
    if (!this.db) this.init();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO security_logs (id, command, safe, approved, threats_json, error_code, source, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.command,
      entry.result.safe ? 1 : 0,
      entry.approved === undefined ? null : entry.approved ? 1 : 0,
      JSON.stringify(entry.result.threats),
      entry.result.errorCode || null,
      entry.source,
      entry.timestamp.toISOString(),
    );
  }

  /**
   * Lấy tất cả logs, sắp xếp mới nhất trước
   */
  getLogs(limit = 100): SecurityLogEntry[] {
    if (!this.db) this.init();
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db
      .prepare('SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];

    return rows.map(this.rowToEntry);
  }

  /**
   * Lấy các lệnh bị chặn (không safe và không approved)
   */
  getBlockedCommands(limit = 50): SecurityLogEntry[] {
    if (!this.db) this.init();
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db
      .prepare(
        'SELECT * FROM security_logs WHERE safe = 0 AND (approved = 0 OR approved IS NULL) ORDER BY timestamp DESC LIMIT ?',
      )
      .all(limit) as Record<string, unknown>[];

    return rows.map(this.rowToEntry);
  }

  /**
   * Thống kê: tổng số lệnh bị chặn theo threat type
   */
  getThreatStats(): Record<string, number> {
    if (!this.db) this.init();
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db
      .prepare('SELECT threats_json FROM security_logs WHERE safe = 0')
      .all() as Record<string, unknown>[];

    const stats: Record<string, number> = {};
    for (const row of rows) {
      try {
        const threats: ThreatDetection[] = JSON.parse(String(row.threats_json));
        for (const t of threats) {
          stats[t.type] = (stats[t.type] || 0) + 1;
        }
      } catch {
        // ignore parse errors
      }
    }
    return stats;
  }

  /**
   * Lấy tỷ lệ block (số lệnh bị chặn / tổng số lệnh)
   * @returns Tỷ lệ từ 0 đến 1, hoặc -1 nếu chưa có dữ liệu
   */
  getBlockRate(): number {
    if (!this.db) this.init();
    if (!this.db) throw new Error('Database not initialized');

    const totalRow = this.db.prepare('SELECT COUNT(*) as count FROM security_logs').get() as
      | {
          count: number;
        }
      | undefined;

    const total = totalRow?.count ?? 0;
    if (total === 0) return -1;

    const blockedRow = this.db
      .prepare('SELECT COUNT(*) as count FROM security_logs WHERE safe = 0')
      .get() as { count: number } | undefined;

    return (blockedRow?.count ?? 0) / total;
  }

  /**
   * Xóa logs cũ hơn N ngày
   */
  cleanOlderThan(days: number): number {
    if (!this.db) this.init();
    if (!this.db) throw new Error('Database not initialized');

    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const result = this.db.prepare('DELETE FROM security_logs WHERE timestamp < ?').run(cutoff);

    return result.changes;
  }

  /**
   * Đóng database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  logTelemetry(
    type: string,
    action: string,
    details: Record<string, unknown>,
    status: 'success' | 'failure',
  ): void {
    this.telemetryLogs.push({ type, action, details, status, timestamp: new Date() });
  }

  getTelemetryLogs(): Array<{
    type: string;
    action: string;
    details: Record<string, unknown>;
    status: 'success' | 'failure';
  }> {
    return [...this.telemetryLogs].reverse();
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private rowToEntry(row: Record<string, unknown>): SecurityLogEntry {
    const safe = Number(row.safe) === 1;
    const approved = row.approved === null ? undefined : Number(row.approved) === 1;
    return {
      id: row.id as string,
      command: row.command as string,
      result: {
        safe,
        command: row.command as string,
        threats: JSON.parse((row.threats_json as string) || '[]'),
        requiresApproval: !approved && !safe,
        errorCode: (row.error_code as string) || undefined,
      },
      approved,
      timestamp: new Date(row.timestamp as string),
      source: row.source as 'local' | 'remote-olt',
    };
  }
}

/**
 * Factory function
 */
export function createSecurityLogger(dbPath?: string): SecurityLogger {
  const logger = new SecurityLogger(dbPath);
  logger.init();
  return logger;
}
