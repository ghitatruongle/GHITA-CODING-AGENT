import type { AgentMiddleware, MiddlewareContext } from '../middleware/types.js';
export declare class GitSafePointManager {
    private static readonly LOCK_TIMEOUT_MS;
    /**
     * Giải phóng tệp tin .git/index.lock nếu đã tồn tại quá lâu (Tác vụ 8)
     */
    static checkAndReleaseLock(cwd: string): void;
    /**
     * Chạy lệnh shell với cơ chế retry luỹ tiến phòng index.lock (Tác vụ 5)
     */
    static execGit(cmd: string, cwd: string, retries?: number, delay?: number): string;
    /**
     * Tạo điểm neo an toàn ẩn nháp ghita-temp-safepoint (Tác vụ 2, 3, 10)
     */
    static createSafePoint(cwd: string): boolean;
    /**
     * Khôi phục (rollback) mã nguồn về trạng thái an toàn gần nhất (Tác vụ 4, 6, 7)
     */
    static rollback(cwd: string): boolean;
    /**
     * Lưu log lịch sử Git actions xuống file log tĩnh (Tác vụ 7)
     */
    private static logGitAction;
}
export declare class GitSafePointMiddleware implements AgentMiddleware {
    readonly name = "GitSafePointMiddleware";
    readonly priority = 5;
    private activeSafepoints;
    /**
     * Pre-tool hook: Tự động kích hoạt tạo Safe-Point trước khi sửa file
     */
    preTool(toolName: string, _args: Record<string, unknown>, _context: MiddlewareContext): Promise<{
        proceed: boolean;
        reason?: string;
    } | void>;
    /**
     * Post-tool hook: Tự động rollback khi phát hiện lệnh run_command bị lỗi đỏ
     */
    postTool(toolName: string, result: string, _context: MiddlewareContext): Promise<{
        modifiedResult?: string;
    } | void>;
    /**
     * Khôi phục an toàn khi có ngoại lệ ném ra trong quá trình chạy
     */
    onError(error: Error, _context: MiddlewareContext): Promise<{
        retry?: boolean;
    } | void>;
}
//# sourceMappingURL=workflow.d.ts.map