// ==============================================================================
// GHITA CODING AGENT - Permission Levels System
// ==============================================================================
/** Default permission mapping */
const DEFAULT_PERMISSIONS = [
    // Read-only — chạy ngay không cần duyệt
    { tool: 'read_file', level: 'read_only', autoApprove: true },
    { tool: 'glob', level: 'read_only', autoApprove: true },
    { tool: 'grep', level: 'read_only', autoApprove: true },
    { tool: 'web_search', level: 'read_only', autoApprove: true },
    { tool: 'web_fetch', level: 'read_only', autoApprove: true },
    { tool: 'list_directory', level: 'read_only', autoApprove: true },
    { tool: 'get_file_info', level: 'read_only', autoApprove: true },
    // Write — cần duyệt
    { tool: 'write_file', level: 'write' },
    { tool: 'edit_file', level: 'write' },
    { tool: 'create_file', level: 'write' },
    { tool: 'bash', level: 'write' },
    { tool: 'terminal_run', level: 'write' },
    // Destructive — cần duyệt + cảnh báo đỏ
    { tool: 'delete_file', level: 'destructive' },
    { tool: 'rm', level: 'destructive' },
    { tool: 'git_reset_hard', level: 'destructive' },
    { tool: 'drop_table', level: 'destructive' },
];
export class PermissionManager {
    permissions = new Map();
    rules = [];
    stepFilters = new Map();
    constructor() {
        this.loadDefaults();
    }
    /** Load default permissions */
    loadDefaults() {
        for (const perm of DEFAULT_PERMISSIONS) {
            this.permissions.set(perm.tool, perm);
        }
    }
    /** Đăng ký một luật kiểm tra context */
    registerRule(rule) {
        this.rules.push(rule);
    }
    /** Kiểm tra quyền truy cập tool kèm theo PermissionContext */
    checkPermission(toolName, context) {
        let level = this.getLevel(toolName);
        let autoApprove = this.isAutoApprove(toolName);
        for (const rule of this.rules) {
            const decision = rule(toolName, context);
            if (decision !== undefined) {
                if (typeof decision === 'boolean') {
                    autoApprove = decision;
                }
                else {
                    if (decision.level !== undefined)
                        level = decision.level;
                    if (decision.autoApprove !== undefined)
                        autoApprove = decision.autoApprove;
                }
            }
        }
        return { level, autoApprove };
    }
    /** Đăng ký danh sách các tool được phép sử dụng ở một step nhất định */
    registerStepFilter(stepIndex, allowedTools) {
        this.stepFilters.set(stepIndex, allowedTools);
    }
    /** Trả về danh sách các tool khả dụng cho stepIndex hiện tại */
    filterActiveTools(stepIndex) {
        if (this.stepFilters.has(stepIndex)) {
            return this.stepFilters.get(stepIndex);
        }
        return Array.from(this.permissions.keys());
    }
    /** Lấy permission level của tool */
    getLevel(toolName) {
        return this.permissions.get(toolName)?.level ?? 'write';
    }
    /** Kiểm tra tool có auto-approve không */
    isAutoApprove(toolName) {
        return this.permissions.get(toolName)?.autoApprove ?? false;
    }
    /** Cập nhật permission cho tool */
    setPermission(tool, level, autoApprove) {
        this.permissions.set(tool, { tool, level, autoApprove });
    }
    /** Lấy tất cả permissions */
    getAll() {
        return [...this.permissions.values()];
    }
    /** Lấy permissions theo level */
    getByLevel(level) {
        return [...this.permissions.values()].filter((p) => p.level === level);
    }
    /** Kiểm tra tool có phải destructive không */
    isDestructive(toolName) {
        return this.getLevel(toolName) === 'destructive';
    }
}
//# sourceMappingURL=permissions.js.map