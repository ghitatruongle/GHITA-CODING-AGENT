export interface ChatLogEntry {
    id: string;
    session_id: string;
    role: string;
    content: string;
    timestamp: number;
    symbol_attached?: string;
}
export interface CacheEntry {
    key: string;
    vector: number[];
    lruIndex: number;
    sizeBytes: number;
}
export declare class RustMemoryAddon {
    private db;
    private isFallbackDb;
    private mockDbLogs;
    private writeCounter;
    private lruCounter;
    private readonly ramCache;
    private ramCacheSizeBytes;
    private readonly MAX_CACHE_SIZE_BYTES;
    private rustBindings;
    constructor(dbPath?: string);
    /**
     * Khởi tạo cơ sở dữ liệu SQLite FTS5 hoặc Fallback Memory Db
     */
    private initDatabase;
    /**
     * Khởi tạo Rust bindings cục bộ
     */
    private initRustBindings;
    /**
     * Đưa cuộc hội thoại mới vào chỉ mục (Relational & FTS5)
     */
    indexChatMessage(msg: ChatLogEntry): Promise<void>;
    /**
     * Chỉ mục hóa nhiều bản ghi cùng một lúc
     */
    indexManyMessages(msgs: ChatLogEntry[]): Promise<void>;
    /**
     * Tìm kiếm từ khóa siêu tốc FTS5
     */
    searchFTS5(query: string, limit?: number): Promise<ChatLogEntry[]>;
    /**
     * Giải phóng phân mảnh SQLite định kỳ bằng lệnh VACUUM
     */
    autoVacuum(): Promise<void>;
    /**
     * Lập trình module chắt lọc ngữ nghĩa tự động dọn dẹp các bản ghi quá hạn 30 ngày
     */
    purgeOldLogs(days?: number): Promise<number>;
    /**
     * Tính toán cosine similarity bằng Rust Addon cục bộ hoặc JS Fallback
     */
    cosineSimilarity(a: number[], b: number[]): number;
    /**
     * RAM Semantic Cache Manager: Nạp vector vào bộ nhớ đệm
     */
    cacheEmbedding(key: string, vector: number[]): void;
    /**
     * RAM Semantic Cache Manager: Lấy vector từ bộ nhớ đệm
     */
    getEmbeddingFromCache(key: string): number[] | undefined;
    /**
     * Thu hồi bộ nhớ đệm LRU cho đến khi dung lượng dưới 100MB
     */
    private evictLeastRecentlyUsed;
    getCacheSize(): number;
    getCacheSizeBytes(): number;
    clearCache(): void;
    /**
     * Xóa sạch dữ liệu database (dùng cho unit tests)
     */
    clearDatabase(): Promise<void>;
    close(): void;
}
//# sourceMappingURL=rustAddon.d.ts.map