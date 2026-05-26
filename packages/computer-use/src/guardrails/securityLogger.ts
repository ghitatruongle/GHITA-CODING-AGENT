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

    const stmt = this.db!.prepare(`
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

    const rows = this.db!.prepare(
      'SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as any[];

    return rows.map(this.rowToEntry);
  }

  /**
   * Lấy các lệnh bị chặn (không safe và không approved)
   */
  getBlockedCommands(limit = 50): SecurityLogEntry[] {
    if (!this.db) this.init();

    const rows = this.db!.prepare(
      'SELECT * FROM security_logs WHERE safe = 0 AND (approved = 0 OR approved IS NULL) ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as any[];

    return rows.map(this.rowToEntry);
  }

  /**
   * Thống kê: tổng số lệnh bị chặn theo threat type
   */
  getThreatStats(): Record<string, number> {
    if (!this.db) this.init();

    const rows = this.db!.prepare(
      'SELECT threats_json FROM security_logs WHERE safe = 0'
    ).all() as any[];

    const stats: Record<string, number> = {};
    for (const row of rows) {
      try {
        const threats: ThreatDetection[] = JSON.parse(row.threats_json);
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

    const total = this.db!.prepare(
      'SELECT COUNT(*) as count FROM security_logs'
    ).get() as { count: number };

    if (total.count === 0) return -1;

    const blocked = this.db!.prepare(
      'SELECT COUNT(*) as count FROM security_logs WHERE safe = 0'
    ).get() as { count: number };

    return blocked.count / total.count;
  }

  /**
   * Xóa logs cũ hơn N ngày
   */
  cleanOlderThan(days: number): number {
    if (!this.db) this.init();

    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const result = this.db!.prepare(
      'DELETE FROM security_logs WHERE timestamp < ?'
    ).run(cutoff);

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

  // =========================================================================
  // Private helpers
  // =========================================================================

  private rowToEntry(row: any): SecurityLogEntry {
    const safe = Number(row.safe) === 1;
    const approved = row.approved === null ? undefined : Number(row.approved) === 1;
    return {
      id: row.id,
      command: row.command,
      result: {
        safe,
        command: row.command,
        threats: JSON.parse(row.threats_json || '[]'),
        requiresApproval: !approved && !safe,
        errorCode: row.error_code || undefined,
      },
      approved,
      timestamp: new Date(row.timestamp),
      source: row.source,
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
