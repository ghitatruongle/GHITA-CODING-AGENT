import { SymbolTag } from '@ghita/shared/node';
import type { AgentMiddleware, MiddlewareContext } from '../middleware/types.js';
export interface HierarchicalSymbol extends SymbolTag {
    children: HierarchicalSymbol[];
    parentName?: string;
    scope: string;
}
export interface ASTLockConfig {
    lockedSymbols: string[];
    enabled: boolean;
    excludeFiles: string[];
}
/**
 * Xây dựng cấu trúc phân cấp Class.Method cho SymbolTag
 */
export declare function buildHierarchy(tags: SymbolTag[]): HierarchicalSymbol[];
/**
 * Tính toán mã băm SHA256 cho code đã loại bỏ toàn bộ khoảng trắng và ngắt dòng
 * (Tối ưu hóa tránh False Alarm khi thay đổi định dạng khoảng trắng)
 */
export declare function computeSemanticHash(nodeText: string): string;
/**
 * Trình quét cấu hình YAML tối giản không cần thư viện ngoài
 */
export declare function loadASTLockConfig(configPath?: string): ASTLockConfig;
export declare class ASTLockLogger {
    private dbPath;
    private db;
    private insertStmt;
    private isInitialized;
    constructor(customDbPath?: string);
    private ensureDb;
    logViolation(filePath: string, symbolName: string, expectedHash: string, actualHash: string, agentId?: string): Promise<void>;
}
export declare class ASTLockEngine {
    private parser;
    private lockedHashes;
    constructor();
    /**
     * Khóa danh sách các symbol trong tệp tin từ mã nguồn ban đầu
     */
    lockSymbols(filePath: string, code: string, lang: string, symbolNamesToLock?: string[]): Promise<void>;
    /**
     * Đối soát mã nguồn mới, phát hiện ranh giới bị phá vỡ (Tác vụ 2, 5)
     */
    validate(filePath: string, newCode: string, lang: string): Promise<{
        valid: boolean;
        violations: string[];
    }>;
    /**
     * Trả về danh sách các symbol bị khóa trong bộ nhớ
     */
    getLockedSymbols(): string[];
    /**
     * Xóa toàn bộ trạng thái khóa
     */
    clear(): void;
}
export declare class ASTLockMiddleware implements AgentMiddleware {
    readonly name = "ASTLockMiddleware";
    readonly priority = 10;
    private engine;
    private logger;
    private configPath;
    constructor(engine?: ASTLockEngine, customDbPath?: string);
    /**
     * Tự động nhận diện ngôn ngữ dựa trên phần mở rộng tệp tin
     */
    private detectLanguageFromPath;
    preTool(toolName: string, args: Record<string, unknown>, context: MiddlewareContext): Promise<{
        proceed: boolean;
        reason?: string;
    } | void>;
}
//# sourceMappingURL=astLock.d.ts.map