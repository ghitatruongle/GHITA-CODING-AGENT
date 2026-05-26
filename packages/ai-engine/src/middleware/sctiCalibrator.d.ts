import type { ChatMessage } from '../types.js';
import type { ChatMiddleware, ChatStreamMiddleware } from '../utils/middleware.js';
/**
 * Trích xuất mã lỗi nổi bật như AST-LOCK-001 hoặc TS2322 (Tác vụ 2)
 */
export declare function extractErrorCode(text: string): string | null;
/**
 * Thuật toán Jaccard Similarity đo khoảng cách từ vựng giữa hai lỗi (Tác vụ 3)
 */
export declare function getJaccardSimilarity(textA: string, textB: string): number;
/**
 * Nén mã diff để tiết kiệm không gian context tối đa (Tác vụ 6)
 */
export declare function compressDiff(diff: string): string;
export interface SCTITrajectory {
    id?: number;
    errorCode: string;
    errorSnippet: string;
    solutionDiff: string;
    timestamp: string;
}
export declare class SCTIEngine {
    private dbPath;
    private db;
    private insertStmt;
    private dbInitialized;
    private inMemoryCache;
    constructor(customDbPath?: string);
    /**
     * Lazily khởi tạo SQLite
     */
    private ensureDb;
    /**
     * Ghi nhận và lưu vết sửa lỗi thành công (Tác vụ 1, 2)
     */
    storeCorrection(errorSnippet: string, solutionDiff: string, errorCodeOverride?: string): Promise<void>;
    /**
     * Đối sánh tương đồng và trả về trajectory khớp nhất (Tác vụ 3, 5)
     */
    getMatchingTrajectory(errorText: string): Promise<SCTITrajectory | null>;
    /**
     * Tự động dọn dẹp các tệp tin lưu vết quá 30 ngày (Tác vụ 8)
     */
    cleanObsoleteCorrections(): Promise<number>;
    getCacheSize(): number;
    clear(): void;
}
export declare function injectSctiTrajectories(messages: ChatMessage[], engine: SCTIEngine): Promise<ChatMessage[]>;
export declare function createSctiMiddleware(engine: SCTIEngine): ChatMiddleware;
export declare function createSctiStreamMiddleware(engine: SCTIEngine): ChatStreamMiddleware;
//# sourceMappingURL=sctiCalibrator.d.ts.map