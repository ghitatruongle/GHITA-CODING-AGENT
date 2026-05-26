import type { AgentMiddleware, MiddlewareContext } from '../middleware/types.js';
export interface MarkdownRule {
    id: string;
    severity: 'error' | 'warning';
    files: string[];
    description: string;
    pattern?: string;
    astCheck?: 'any-keyword';
}
export interface CheckIssue {
    ruleId: string;
    severity: 'error' | 'warning';
    filePath: string;
    line: number;
    column: number;
    message: string;
}
/**
 * Trình phân tích quy tắc markdown và quét mã nguồn tĩnh (AST / Regex)
 */
export declare class MarkdownRulesChecker {
    private rules;
    constructor(rulesDir?: string);
    /**
     * Tải và phân tích toàn bộ quy tắc *.md
     */
    loadRules(dir: string): void;
    /**
     * Phân tích tệp markdown ra đối tượng cấu trúc Rule
     */
    private parseRuleMarkdown;
    /**
     * Kiểm tra xem tệp tin có khớp mẫu glob hay không (Hỗ trợ đơn giản *.ts và tương đương)
     */
    private matchFilePattern;
    /**
     * Quét tệp tin dựa trên các quy tắc đã nạp
     */
    checkFile(filePath: string, content: string): CheckIssue[];
    getRules(): MarkdownRule[];
    /**
     * Tự động sinh đề xuất sửa đổi chuẩn cú pháp (Tác vụ 5)
     * Thay thế các từ khóa 'any' không an toàn bằng 'unknown'
     */
    generateFix(content: string): string;
    /**
     * Sinh chuỗi diff hiển thị dòng trước và sau sửa đổi
     */
    generateDiff(original: string, fixed: string): string;
}
/**
 * Middleware Agent chèn rào chắn preTool kiểm duyệt quy tắc code sạch (Tác vụ 3)
 */
export declare class MarkdownChecksMiddleware implements AgentMiddleware {
    readonly name = "MarkdownChecksMiddleware";
    readonly priority = 6;
    private checker;
    private rulesDir;
    constructor(rulesDir?: string);
    /**
     * Pre-tool hook: Chặn ghi file nếu vi phạm quy chuẩn code sạch
     */
    preTool(toolName: string, args: Record<string, unknown>, _context: MiddlewareContext): Promise<{
        proceed: boolean;
        reason?: string;
    } | void>;
    /**
     * Lưu log vi phạm xuống file log tĩnh (Tác vụ 7)
     */
    private logViolations;
}
//# sourceMappingURL=markdownRules.d.ts.map