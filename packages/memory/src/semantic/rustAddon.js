// ==============================================================================
// GHITA CODING AGENT - Phase 19: SQLite FTS5 Memory Indexer & Rust Cosine similarity Addon
// ==============================================================================
// Lập chỉ mục FTS5 hội thoại, tính cosine similarity vector, RAM cache cap 100MB
// định kỳ Auto-Vacuum chống phân mảnh và tự dọn dẹp các bản ghi quá hạn 30 ngày.
// ==============================================================================
export class RustMemoryAddon {
    db = null;
    isFallbackDb = true;
    mockDbLogs = [];
    writeCounter = 0;
    lruCounter = 0;
    ramCache = new Map();
    ramCacheSizeBytes = 0;
    MAX_CACHE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB limit
    // Try to load precompiled Rust N-API bindings if they exist
    rustBindings = null;
    constructor(dbPath = ':memory:') {
        this.initDatabase(dbPath);
        this.initRustBindings();
    }
    /**
     * Khởi tạo cơ sở dữ liệu SQLite FTS5 hoặc Fallback Memory Db
     */
    initDatabase(dbPath) {
        try {
            // Dynamic import better-sqlite3
            // @ts-ignore
            const DatabaseConstructor = require('better-sqlite3');
            if (DatabaseConstructor) {
                this.db = new DatabaseConstructor(dbPath);
                // 1. Tạo bảng dữ liệu quan hệ chứa chat history phân tầng
                this.db.exec(`
          CREATE TABLE IF NOT EXISTS old_chats (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            symbol_attached TEXT
          );
        `);
                // 2. Tạo bảng ảo FTS5 độc lập để tránh type mismatch của rowid (luôn là integer)
                this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS old_chats_fts USING fts5(
            id UNINDEXED,
            session_id UNINDEXED,
            role UNINDEXED,
            content,
            timestamp UNINDEXED
          );
        `);
                this.isFallbackDb = false;
            }
        }
        catch {
            // Fallback sang JS In-memory Database
            this.isFallbackDb = true;
            this.mockDbLogs = [];
        }
    }
    /**
     * Khởi tạo Rust bindings cục bộ
     */
    initRustBindings() {
        try {
            // @ts-ignore
            this.rustBindings = require('./rust/index.node');
        }
        catch {
            // Không load được Rust addon -> tự động fallback sang thuật toán JS thuần
            this.rustBindings = null;
        }
    }
    /**
     * Đưa cuộc hội thoại mới vào chỉ mục (Relational & FTS5)
     */
    async indexChatMessage(msg) {
        if (!this.isFallbackDb && this.db) {
            // Ghi bảng quan hệ chính
            const stmt1 = this.db.prepare(`
        INSERT OR REPLACE INTO old_chats (id, session_id, role, content, timestamp, symbol_attached)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
            stmt1.run(msg.id, msg.session_id, msg.role, msg.content, msg.timestamp, msg.symbol_attached || null);
            // Ghi bảng FTS5
            const deleteFts = this.db.prepare('DELETE FROM old_chats_fts WHERE id = ?');
            deleteFts.run(msg.id);
            const stmt2 = this.db.prepare(`
        INSERT INTO old_chats_fts (id, session_id, role, content, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
            stmt2.run(msg.id, msg.session_id, msg.role, msg.content, msg.timestamp);
        }
        else {
            // Fallback
            const idx = this.mockDbLogs.findIndex(item => item.id === msg.id);
            if (idx >= 0) {
                this.mockDbLogs[idx] = msg;
            }
            else {
                this.mockDbLogs.push(msg);
            }
        }
        // Cơ chế Auto-Vacuum định kỳ chạy sau mỗi 10 lệnh ghi để giải phóng phân mảnh SQLite
        this.writeCounter++;
        if (this.writeCounter % 10 === 0) {
            await this.autoVacuum();
        }
    }
    /**
     * Chỉ mục hóa nhiều bản ghi cùng một lúc
     */
    async indexManyMessages(msgs) {
        if (!this.isFallbackDb && this.db) {
            const insert = this.db.transaction((items) => {
                const stmt1 = this.db.prepare(`
          INSERT OR REPLACE INTO old_chats (id, session_id, role, content, timestamp, symbol_attached)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
                const deleteFts = this.db.prepare('DELETE FROM old_chats_fts WHERE id = ?');
                const stmt2 = this.db.prepare(`
          INSERT INTO old_chats_fts (id, session_id, role, content, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `);
                for (const item of items) {
                    stmt1.run(item.id, item.session_id, item.role, item.content, item.timestamp, item.symbol_attached || null);
                    deleteFts.run(item.id);
                    stmt2.run(item.id, item.session_id, item.role, item.content, item.timestamp);
                }
            });
            insert(msgs);
        }
        else {
            for (const item of msgs) {
                await this.indexChatMessage(item);
            }
        }
    }
    /**
     * Tìm kiếm từ khóa siêu tốc FTS5
     */
    async searchFTS5(query, limit = 10) {
        if (!this.isFallbackDb && this.db) {
            try {
                const stmt = this.db.prepare(`
          SELECT c.id, c.session_id, c.role, c.content, c.timestamp, c.symbol_attached
          FROM old_chats_fts f
          JOIN old_chats c ON f.id = c.id
          WHERE old_chats_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
                const rows = stmt.all(query, limit);
                return rows;
            }
            catch {
                // Fallback sang tìm kiếm LIKE thông dụng nếu cú pháp MATCH lỗi
                const stmt = this.db.prepare(`
          SELECT id, session_id, role, content, timestamp, symbol_attached
          FROM old_chats
          WHERE content LIKE ?
          ORDER BY timestamp DESC
          LIMIT ?
        `);
                const rows = stmt.all(`%${query}%`, limit);
                return rows;
            }
        }
        else {
            // Fallback mô phỏng FTS5 bằng regex/token matching
            const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
            if (queryTokens.length === 0)
                return [];
            const scored = this.mockDbLogs.map(log => {
                let score = 0;
                const contentLower = log.content.toLowerCase();
                for (const token of queryTokens) {
                    if (contentLower.includes(token)) {
                        score++;
                    }
                }
                return { log, score };
            });
            return scored
                .filter(item => item.score > 0)
                .sort((a, b) => b.score - a.score || b.log.timestamp - a.log.timestamp)
                .map(item => item.log)
                .slice(0, limit);
        }
    }
    /**
     * Giải phóng phân mảnh SQLite định kỳ bằng lệnh VACUUM
     */
    async autoVacuum() {
        if (!this.isFallbackDb && this.db) {
            try {
                this.db.exec('VACUUM');
            }
            catch {
                // Bỏ qua lỗi vacuum khi database bận rộn
            }
        }
    }
    /**
     * Lập trình module chắt lọc ngữ nghĩa tự động dọn dẹp các bản ghi quá hạn 30 ngày
     */
    async purgeOldLogs(days = 30) {
        const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
        if (!this.isFallbackDb && this.db) {
            // Xóa trong bảng quan hệ chính
            const stmt1 = this.db.prepare('DELETE FROM old_chats WHERE timestamp < ?');
            const info1 = stmt1.run(cutoffTime);
            // Xóa trong bảng FTS5
            const stmt2 = this.db.prepare('DELETE FROM old_chats_fts WHERE timestamp < ?');
            stmt2.run(cutoffTime);
            // Auto-Vacuum ngay sau khi dọn dẹp dung lượng lớn
            await this.autoVacuum();
            return info1.changes;
        }
        else {
            // Fallback
            const prevLength = this.mockDbLogs.length;
            this.mockDbLogs = this.mockDbLogs.filter(log => log.timestamp >= cutoffTime);
            return prevLength - this.mockDbLogs.length;
        }
    }
    /**
     * Tính toán cosine similarity bằng Rust Addon cục bộ hoặc JS Fallback
     */
    cosineSimilarity(a, b) {
        // 1. Thử dùng Rust binding tốc độ cao nếu khả dụng
        if (this.rustBindings?.cosine_similarity) {
            try {
                return this.rustBindings.cosine_similarity(a, b);
            }
            catch {
                // Fallback sang JS nếu Rust ném ngoại lệ
            }
        }
        // 2. JS Fallback hiệu suất cao
        const length = Math.min(a.length, b.length);
        if (length === 0)
            return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < length; i++) {
            const valA = a[i] ?? 0;
            const valB = b[i] ?? 0;
            dotProduct += valA * valB;
            normA += valA * valA;
            normB += valB * valB;
        }
        if (normA === 0 || normB === 0)
            return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    /**
     * RAM Semantic Cache Manager: Nạp vector vào bộ nhớ đệm
     */
    cacheEmbedding(key, vector) {
        // Kích thước ước lượng: 2 bytes mỗi ký tự của string + 8 bytes mỗi số thực Float64 + 64 bytes overhead cấu trúc
        const sizeBytes = key.length * 2 + vector.length * 8 + 64;
        // 1. Tạo entry mới và cập nhật cache
        const existing = this.ramCache.get(key);
        if (existing) {
            this.ramCacheSizeBytes -= existing.sizeBytes;
        }
        this.ramCache.set(key, {
            key,
            vector,
            lruIndex: this.lruCounter++,
            sizeBytes,
        });
        this.ramCacheSizeBytes += sizeBytes;
        // 2. Cơ chế LRU Eviction: Nếu vượt quá 100MB RAM, xóa các phần tử lâu chưa dùng đến nhất
        if (this.ramCacheSizeBytes > this.MAX_CACHE_SIZE_BYTES) {
            this.evictLeastRecentlyUsed();
        }
    }
    /**
     * RAM Semantic Cache Manager: Lấy vector từ bộ nhớ đệm
     */
    getEmbeddingFromCache(key) {
        const entry = this.ramCache.get(key);
        if (!entry)
            return undefined;
        // Cập nhật lruIndex cho LRU tracking
        entry.lruIndex = this.lruCounter++;
        return entry.vector;
    }
    /**
     * Thu hồi bộ nhớ đệm LRU cho đến khi dung lượng dưới 100MB
     */
    evictLeastRecentlyUsed() {
        const entries = Array.from(this.ramCache.values());
        // Sắp xếp tăng dần theo logical counter (cũ nhất lên đầu)
        entries.sort((a, b) => a.lruIndex - b.lruIndex);
        for (const entry of entries) {
            if (this.ramCacheSizeBytes <= this.MAX_CACHE_SIZE_BYTES) {
                break;
            }
            this.ramCache.delete(entry.key);
            this.ramCacheSizeBytes -= entry.sizeBytes;
        }
    }
    getCacheSize() {
        return this.ramCache.size;
    }
    getCacheSizeBytes() {
        return this.ramCacheSizeBytes;
    }
    clearCache() {
        this.ramCache.clear();
        this.ramCacheSizeBytes = 0;
    }
    /**
     * Xóa sạch dữ liệu database (dùng cho unit tests)
     */
    async clearDatabase() {
        if (!this.isFallbackDb && this.db) {
            this.db.exec('DELETE FROM old_chats');
            this.db.exec('DELETE FROM old_chats_fts');
            await this.autoVacuum();
        }
        else {
            this.mockDbLogs = [];
        }
    }
    close() {
        if (this.db) {
            try {
                this.db.close();
            }
            catch {
                // Bỏ qua
            }
            this.db = null;
        }
    }
}
//# sourceMappingURL=rustAddon.js.map