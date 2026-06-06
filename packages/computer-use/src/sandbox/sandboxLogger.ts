// =============================================================================
// GHITA CODING AGENT - Sandbox Logger
// Ghi vết logs hoạt động sandbox + thống kê tài nguyên container
// Hỗ trợ 2 mode: in-memory (default) và SQLite persistence
// =============================================================================

import type { SandboxLogEntry, ContainerStats } from './types.js';
import type Database from 'better-sqlite3';

/**
 * Cấu hình cho SQLite persistence
 */
export interface SandboxLoggerConfig {
  /** Đường dẫn file SQLite database (nếu không truyền, dùng in-memory only) */
  dbPath?: string;
  /** Giới hạn số logs giữ trong memory cache */
  maxLogs?: number;
}

/**
 * SandboxLogger — Ghi và quản lý logs hoạt động của Docker sandbox
 * Logs được lưu cả in-memory cache lẫn SQLite (nếu cấu hình dbPath)
 */
export class SandboxLogger {
  private logs: SandboxLogEntry[] = [];
  private maxLogs: number;
  private db: Database.Database | null = null;
  private insertStmt: Database.Statement | null = null;
  private dbPath: string | null = null;

  constructor(config: SandboxLoggerConfig = {}) {
    this.maxLogs = config.maxLogs ?? 10_000;
    this.dbPath = config.dbPath ?? null;
  }

  // =========================================================================
  // SQLite Initialization (lazy — gọi initDatabase() trước khi dùng)
  // =========================================================================

  /**
   * Khởi tạo SQLite database và tạo bảng logs
   * Phải gọi trước khi log nếu muốn persist xuống SQLite
   */
  async initDatabase(dbPath?: string): Promise<void> {
    const path = dbPath ?? this.dbPath;
    if (!path) return;

    try {
      // Dynamic import để không fail khi chưa install better-sqlite3
      const Database = (await import('better-sqlite3')).default;
      this.db = new Database(path);
      this.dbPath = path;

      // Tạo bảng sandbox_logs nếu chưa tồn tại
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sandbox_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          container_id TEXT NOT NULL,
          container_name TEXT NOT NULL,
          event TEXT NOT NULL,
          message TEXT NOT NULL,
          metadata TEXT,
          timestamp TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sandbox_logs_container
          ON sandbox_logs(container_id);
        CREATE INDEX IF NOT EXISTS idx_sandbox_logs_event
          ON sandbox_logs(event);
        CREATE INDEX IF NOT EXISTS idx_sandbox_logs_timestamp
          ON sandbox_logs(timestamp);
      `);

      // Prepare statement cho insert nhanh
      this.insertStmt = this.db.prepare(`
        INSERT INTO sandbox_logs (container_id, container_name, event, message, metadata, timestamp)
        VALUES (@containerId, @containerName, @event, @message, @metadata, @timestamp)
      `);

      // Tự động cleanup logs cũ hơn 30 ngày
      this.cleanupOldLogs(30);
    } catch (err: unknown) {
      console.warn(
        `[DSO] SQLite unavailable (${(err as Error).message}), falling back to in-memory logging`,
      );
      this.db = null;
      this.insertStmt = null;
    }
  }

  /**
   * Ghi một log entry — xuống cả memory cache và SQLite
   */
  log(entry: SandboxLogEntry): void {
    // 1. Ghi vào memory cache
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 2. Ghi vào SQLite nếu đã init
    if (this.insertStmt) {
      try {
        this.insertStmt.run({
          containerId: entry.containerId,
          containerName: entry.containerName,
          event: entry.event,
          message: entry.message,
          metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
          timestamp: entry.timestamp.toISOString(),
        });
      } catch (err: unknown) {
        console.warn(`[DSO] SQLite log failed: ${(err as Error).message}`);
      }
    }

    // 3. Console log cho debug
    const prefix = `[DSO][${entry.event.toUpperCase()}]`;
    const timestamp = entry.timestamp.toISOString();
    console.info(`${prefix} ${timestamp} ${entry.containerName}: ${entry.message}`);
  }

  // =========================================================================
  // Query từ SQLite
  // =========================================================================

  /**
   * Lấy logs từ SQLite (nếu có) hoặc memory
   */
  getLogs(): SandboxLogEntry[] {
    return [...this.logs];
  }

  /**
   * Query logs từ SQLite với điều kiện lọc
   */
  queryLogsFromDb(
    options: {
      containerId?: string;
      event?: string;
      since?: Date;
      limit?: number;
    } = {},
  ): SandboxLogEntry[] {
    if (!this.db) return this.getLogs();

    let sql = 'SELECT * FROM sandbox_logs WHERE 1=1';
    const params: Record<string, string | number> = {};

    if (options.containerId) {
      sql += ' AND container_id = @containerId';
      params.containerId = options.containerId;
    }
    if (options.event) {
      sql += ' AND event = @event';
      params.event = options.event;
    }
    if (options.since) {
      sql += ' AND timestamp >= @since';
      params.since = options.since.toISOString();
    }

    sql += ' ORDER BY timestamp DESC';

    if (options.limit) {
      sql += ' LIMIT @limit';
      params.limit = options.limit;
    }

    const rows = this.db.prepare(sql).all(params);
    return rows.map(this.rowToLogEntry) as SandboxLogEntry[];
  }

  /**
   * Lấy logs theo container ID (memory)
   */
  getLogsByContainer(containerId: string): SandboxLogEntry[] {
    return this.logs.filter((l) => l.containerId === containerId);
  }

  /**
   * Lấy logs theo event type (memory)
   */
  getLogsByEvent(event: SandboxLogEntry['event']): SandboxLogEntry[] {
    return this.logs.filter((l) => l.event === event);
  }

  /**
   * Lấy N logs gần nhất (memory)
   */
  getRecentLogs(count: number = 100): SandboxLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Lấy số lượng logs trong SQLite
   */
  getDbLogCount(): number {
    if (!this.db) return 0;
    const result = this.db.prepare('SELECT COUNT(*) as count FROM sandbox_logs').get() as Record<
      string,
      unknown
    >;
    return (result?.count as number) ?? 0;
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /**
   * Xóa tất cả logs (memory + SQLite)
   */
  clear(): void {
    this.logs = [];
    if (this.db) {
      this.db.exec('DELETE FROM sandbox_logs');
    }
  }

  /**
   * Xóa logs cũ hơn N ngày trong SQLite
   */
  cleanupOldLogs(days: number = 30): number {
    if (!this.db) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const result = this.db
      .prepare('DELETE FROM sandbox_logs WHERE timestamp < @cutoff')
      .run({ cutoff: cutoff.toISOString() });

    return result.changes;
  }

  /**
   * Đóng kết nối SQLite
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.insertStmt = null;
    }
  }

  // =========================================================================
  // Export & Summary
  // =========================================================================

  /**
   * Xuất logs ra JSON string
   */
  exportJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Tạo báo cáo tóm tắt sandbox session
   */
  getSessionSummary(): {
    totalLogs: number;
    dbLogCount: number;
    startEvents: number;
    stopEvents: number;
    errorEvents: number;
    healthEvents: number;
    firstLog?: Date;
    lastLog?: Date;
    uniqueContainers: number;
  } {
    const startEvents = this.logs.filter((l) => l.event === 'start').length;
    const stopEvents = this.logs.filter((l) => l.event === 'stop').length;
    const errorEvents = this.logs.filter((l) => l.event === 'error').length;
    const healthEvents = this.logs.filter((l) => l.event === 'health').length;
    const uniqueContainers = new Set(this.logs.map((l) => l.containerId)).size;

    return {
      totalLogs: this.logs.length,
      dbLogCount: this.getDbLogCount(),
      startEvents,
      stopEvents,
      errorEvents,
      healthEvents,
      firstLog: this.logs[0]?.timestamp,
      lastLog: this.logs[this.logs.length - 1]?.timestamp,
      uniqueContainers,
    };
  }

  /**
   * Tính toán resource usage summary từ mảng stats
   */
  static computeResourceSummary(statsArray: ContainerStats[]): {
    totalCpuPercent: number;
    totalMemoryUsageMb: number;
    totalMemoryLimitMb: number;
    totalNetworkRxMb: number;
    totalNetworkTxMb: number;
    containerCount: number;
  } {
    if (statsArray.length === 0) {
      return {
        totalCpuPercent: 0,
        totalMemoryUsageMb: 0,
        totalMemoryLimitMb: 0,
        totalNetworkRxMb: 0,
        totalNetworkTxMb: 0,
        containerCount: 0,
      };
    }

    return {
      totalCpuPercent: Math.round(statsArray.reduce((sum, s) => sum + s.cpuPercent, 0) * 100) / 100,
      totalMemoryUsageMb:
        Math.round(statsArray.reduce((sum, s) => sum + s.memoryUsageMb, 0) * 100) / 100,
      totalMemoryLimitMb:
        Math.round(statsArray.reduce((sum, s) => sum + s.memoryLimitMb, 0) * 100) / 100,
      totalNetworkRxMb:
        Math.round(
          (statsArray.reduce((sum, s) => sum + s.networkRxBytes, 0) / (1024 * 1024)) * 100,
        ) / 100,
      totalNetworkTxMb:
        Math.round(
          (statsArray.reduce((sum, s) => sum + s.networkTxBytes, 0) / (1024 * 1024)) * 100,
        ) / 100,
      containerCount: statsArray.length,
    };
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private rowToLogEntry(row: unknown): SandboxLogEntry {
    const r = row as Record<string, unknown>;
    return {
      containerId: r.container_id as string,
      containerName: r.container_name as string,
      event: r.event as SandboxLogEntry['event'],
      message: r.message as string,
      metadata: r.metadata ? JSON.parse(r.metadata as string) : undefined,
      timestamp: new Date(r.timestamp as string),
    };
  }
}
