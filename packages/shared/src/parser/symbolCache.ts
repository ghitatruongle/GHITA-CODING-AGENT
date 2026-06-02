// ==============================================================================
// GHITA CODING AGENT - SQLite Symbol Cache
// ==============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as url from 'url';
import Database from 'better-sqlite3';
import type { SymbolTag } from './polyglotTags.js';

let __dirname = '';
try {
  if (typeof url.fileURLToPath === 'function') {
    __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  }
} catch (e) {
  // ignore
}

const DEFAULT_DB_PATH = __dirname ? path.resolve(__dirname, '../../resources/symbol-cache.db') : '';

export class SymbolCache {
  private db: Database.Database;

  constructor(customDbPath?: string) {
    const dbPath = customDbPath || DEFAULT_DB_PATH;
    
    // Đảm bảo thư mục cha của dbPath tồn tại
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeTable();
  }

  /**
   * Tạo bảng cache nếu chưa tồn tại
   */
  private initializeTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_cache (
        filePath TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        symbols TEXT NOT NULL,
        lastUpdated INTEGER NOT NULL
      )
    `);
  }

  /**
   * Tính mã MD5 của nội dung văn bản
   */
  public calculateHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Lấy danh sách Symbol tag từ cache nếu file chưa thay đổi
   * @param filePath Đường dẫn tuyệt đối của file
   * @param currentHash Mã băm hiện tại của file
   */
  public getCachedSymbols(filePath: string, currentHash: string): SymbolTag[] | null {
    try {
      const stmt = this.db.prepare('SELECT hash, symbols FROM file_cache WHERE filePath = ?');
      const row = stmt.get(filePath) as { hash: string; symbols: string } | undefined;

      if (row && row.hash === currentHash) {
        return JSON.parse(row.symbols) as SymbolTag[];
      }
    } catch (err) {
      console.warn(`Không thể lấy cache cho file ${filePath}:`, err);
    }
    return null;
  }

  /**
   * Ghi kết quả bóc tách symbols mới vào SQLite cache
   * @param filePath Đường dẫn tuyệt đối của file
   * @param hash Mã băm nội dung file
   * @param symbols Danh sách Symbol tags
   */
  public saveCachedSymbols(filePath: string, hash: string, symbols: SymbolTag[]): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO file_cache (filePath, hash, symbols, lastUpdated)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(filePath, hash, JSON.stringify(symbols), Date.now());
    } catch (err) {
      console.warn(`Không thể lưu cache cho file ${filePath}:`, err);
    }
  }

  /**
   * Đóng kết nối cơ sở dữ liệu
   */
  public close(): void {
    try {
      this.db.close();
    } catch (err) {
      console.warn('Lỗi khi đóng cơ sở dữ liệu SQLite:', err);
    }
  }
}
