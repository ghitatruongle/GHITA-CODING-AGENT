// ==============================================================================
// GHITA CODING AGENT - Phase 9: SCTI (Self-Correcting Trajectory Injection)
// ==============================================================================
// Động cơ tự vá lỗi ghi vết.
// Phát hiện và lưu vết sửa lỗi thành công, đối sánh ngữ nghĩa và tiêm few-shot
// giúp Agent sửa lỗi chính xác ngay trong lượt đầu.
// Tham chiếu: SWE-agent (trajectories)
// ==============================================================================

import type BetterSqlite3 from 'better-sqlite3';
type BetterSqlite3Database = InstanceType<typeof BetterSqlite3>;
import type { ChatMessage } from '../types.js';
import type { ChatMiddleware, ChatStreamMiddleware } from '../utils/middleware.js';

// ==============================================================================
// Utility Functions
// ==============================================================================

/**
 * Trích xuất mã lỗi nổi bật như AST-LOCK-001 hoặc TS2322 (Tác vụ 2)
 */
export function extractErrorCode(text: string): string | null {
  const astLockMatch = text.match(/AST-LOCK-\d+/i);
  if (astLockMatch) return astLockMatch[0].toUpperCase();

  const tsMatch = text.match(/TS\d+/i);
  if (tsMatch) return tsMatch[0].toUpperCase();

  const eslintMatch = text.match(/eslint\([\w-]+\)/i);
  if (eslintMatch) return eslintMatch[0].toLowerCase();

  return null;
}

/**
 * Thuật toán Jaccard Similarity đo khoảng cách từ vựng giữa hai lỗi (Tác vụ 3)
 */
export function getJaccardSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(
    textA
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 3),
  );
  const wordsB = new Set(
    textB
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 3),
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersectionSize = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersectionSize++;
  }

  const unionSize = wordsA.size + wordsB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Nén mã diff để tiết kiệm không gian context tối đa (Tác vụ 6)
 */
export function compressDiff(diff: string): string {
  // Loại bỏ các dòng trống thừa và nén khoảng trắng
  return diff
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .join('\n');
}

// ==============================================================================
// SCTIEngine — Lõi quản lý SQLite lưu vết sửa đổi (Tác vụ 1, 2, 3, 5, 6, 7, 8)
// ==============================================================================

export interface SCTITrajectory {
  id?: number;
  errorCode: string;
  errorSnippet: string;
  solutionDiff: string;
  timestamp: string;
}

interface Runnable {
  run(params: Record<string, unknown>): unknown;
}

export class SCTIEngine {
  private dbPath: string | null = null;
  private db: BetterSqlite3Database | null = null;
  private insertStmt: Runnable | null = null;
  private dbInitialized = false;

  // Cache bộ nhớ trong phòng trường hợp SQLite lỗi
  private inMemoryCache: SCTITrajectory[] = [];

  constructor(customDbPath?: string) {
    this.dbPath = customDbPath ?? null;
  }

  /**
   * Lazily khởi tạo SQLite
   */
  private async ensureDb(): Promise<void> {
    if (this.dbInitialized) return;
    this.dbInitialized = true;
    if (!this.dbPath) return;

    try {
      const Database = (await import('better-sqlite3')).default;
      this.db = new Database(this.dbPath) as InstanceType<typeof Database>;

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS scti_corrections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          error_code TEXT,
          error_snippet TEXT NOT NULL,
          solution_diff TEXT NOT NULL,
          timestamp TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scti_error_code
        ON scti_corrections(error_code);
      `);

      this.insertStmt = this.db.prepare(`
        INSERT INTO scti_corrections (error_code, error_snippet, solution_diff, timestamp)
        VALUES (@errorCode, @errorSnippet, @solutionDiff, @timestamp)
      `) as Runnable;

      const rows = this.db.prepare('SELECT * FROM scti_corrections').all() as Array<{
        id: number;
        error_code: string;
        error_snippet: string;
        solution_diff: string;
        timestamp: string;
      }>;
      for (const row of rows) {
        this.inMemoryCache.push({
          id: row.id,
          errorCode: row.error_code || '',
          errorSnippet: row.error_snippet,
          solutionDiff: row.solution_diff,
          timestamp: row.timestamp,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[SCTIEngine] SQLite unavailable (${message}), fallback to in-memory`);
      this.db = null;
      this.insertStmt = null;
    }
  }

  /**
   * Ghi nhận và lưu vết sửa lỗi thành công (Tác vụ 1, 2)
   */
  public async storeCorrection(
    errorSnippet: string,
    solutionDiff: string,
    errorCodeOverride?: string,
  ): Promise<void> {
    await this.ensureDb();

    const errorCode = errorCodeOverride ?? extractErrorCode(errorSnippet) ?? 'UNKNOWN';
    const timestamp = new Date().toISOString();
    const compressed = compressDiff(solutionDiff);

    const entry: SCTITrajectory = {
      errorCode,
      errorSnippet,
      solutionDiff: compressed,
      timestamp,
    };

    // 1. Lưu vào cache trong bộ nhớ
    this.inMemoryCache.push(entry);

    // 2. Lưu vào SQLite
    if (this.insertStmt) {
      try {
        this.insertStmt.run({
          errorCode,
          errorSnippet,
          solutionDiff: compressed,
          timestamp,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[SCTIEngine] SQLite insert failed: ${message}`);
      }
    }
  }

  /**
   * Đối sánh tương đồng và trả về trajectory khớp nhất (Tác vụ 3, 5)
   */
  public async getMatchingTrajectory(errorText: string): Promise<SCTITrajectory | null> {
    await this.ensureDb();

    const currentCode = extractErrorCode(errorText);

    // 1. Ưu tiên đối sánh khớp hoàn toàn mã lỗi trước
    if (currentCode && currentCode !== 'UNKNOWN') {
      const match = this.inMemoryCache.find((t) => t.errorCode === currentCode);
      if (match) return match;
    }

    // 2. Đối sánh tương đồng Jaccard nếu không có mã lỗi hoặc không tìm thấy khớp hoàn toàn
    let bestMatch: SCTITrajectory | null = null;
    let highestSim = 0.2; // Ngưỡng tương đồng tối thiểu là 20%

    for (const trajectory of this.inMemoryCache) {
      const sim = getJaccardSimilarity(errorText, trajectory.errorSnippet);
      if (sim > highestSim) {
        highestSim = sim;
        bestMatch = trajectory;
      }
    }

    return bestMatch;
  }

  /**
   * Tự động dọn dẹp các tệp tin lưu vết quá 30 ngày (Tác vụ 8)
   */
  public async cleanObsoleteCorrections(): Promise<number> {
    await this.ensureDb();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Lọc cache bộ nhớ trong
    this.inMemoryCache = this.inMemoryCache.filter(
      (t) => new Date(t.timestamp).getTime() > thirtyDaysAgo,
    );

    // Dọn dẹp SQLite
    if (this.db) {
      try {
        const timeLimit = new Date(thirtyDaysAgo).toISOString();
        const res = this.db
          .prepare('DELETE FROM scti_corrections WHERE timestamp < ?')
          .run(timeLimit) as { changes: number };
        return res.changes;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[SCTIEngine] Clean failed: ${message}`);
      }
    }
    return 0;
  }

  public getCacheSize(): number {
    return this.inMemoryCache.length;
  }

  public clear(): void {
    this.inMemoryCache = [];
    if (this.db) {
      try {
        this.db.exec('DELETE FROM scti_corrections');
      } catch {
        // Bỏ qua lỗi clear
      }
    }
  }
}

// ==============================================================================
// SCTI Injector — Middleware tiêm Few-shot động (Tác vụ 4, 5, 6, 10)
// ==============================================================================

export async function injectSctiTrajectories(
  messages: ChatMessage[],
  engine: SCTIEngine,
): Promise<ChatMessage[]> {
  // 1. Tìm tin nhắn lỗi gần nhất trong lịch sử hội thoại
  const lastErrorMsg = [...messages]
    .reverse()
    .find(
      (m) =>
        m.role === 'user' &&
        (m.content.toLowerCase().includes('error') ||
          m.content.toLowerCase().includes('failed') ||
          m.content.toLowerCase().includes('crashed') ||
          m.content.toLowerCase().includes('fail')),
    );

  if (!lastErrorMsg || !lastErrorMsg.content) return messages;

  // 2. Tìm kiếm trajectory sửa đổi khớp nhất từ engine
  const match = await engine.getMatchingTrajectory(lastErrorMsg.content);
  if (!match) return messages;

  // 3. Sao chép và tiêm Few-shot prompt ngầm vào System Message
  const updatedMessages = messages.map((m) => ({ ...m }));
  const systemMsg = updatedMessages.find((m) => m.role === 'system');

  const fewShotPrompt = `
\n\n[SCTI FEW-SHOT VÁ LỖI TỰ ĐỘNG]
Hệ thống phát hiện một lỗi kiểm thử/biên dịch tương tự bạn đã sửa đổi thành công trong lịch sử.
Hãy sử dụng hành trình sửa đổi (Trajectory Diff) dưới đây để sửa lỗi hiện tại một cách chuẩn xác nhất ngay trong lượt đầu:
- Log lỗi tương đồng trong lịch sử:
"""
${match.errorSnippet.trim()}
"""
- Trajectory Diff sửa đổi thành công mẫu (Đã tối ưu):
"""
${match.solutionDiff.trim()}
"""
`;

  if (systemMsg) {
    systemMsg.content += fewShotPrompt;
  } else {
    // Nếu không có system message, tự chèn lên vị trí đầu tiên
    updatedMessages.unshift({
      role: 'system',
      content: `Bạn là trợ lý lập trình tự trị thông minh.${fewShotPrompt}`,
    });
  }

  return updatedMessages;
}

// ==============================================================================
// Factories: Khởi tạo Middleware cho AI Gateway (Tác vụ 4)
// ==============================================================================

export function createSctiMiddleware(engine: SCTIEngine): ChatMiddleware {
  return async (params, next) => {
    const updatedMessages = await injectSctiTrajectories(params.messages, engine);
    return next(updatedMessages, params.options);
  };
}

export function createSctiStreamMiddleware(engine: SCTIEngine): ChatStreamMiddleware {
  return async (params, next) => {
    const updatedMessages = await injectSctiTrajectories(params.messages, engine);
    return next(updatedMessages, params.options);
  };
}
