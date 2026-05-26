import type { PermissionContext } from '../types.js';
/** 3 cấp độ permission */
export type PermissionLevel = 'read_only' | 'write' | 'destructive';
/** Tool permission mapping */
export interface ToolPermission {
    tool: string;
    level: PermissionLevel;
    autoApprove?: boolean;
}
export type PermissionRule = (toolName: string, context?: PermissionContext) => boolean | {
    level?: PermissionLevel;
    autoApprove?: boolean;
} | undefined;
export declare class PermissionManager {
    private permissions;
    private rules;
    private stepFilters;
    constructor();
    /** Load default permissions */
    private loadDefaults;
    /** Đăng ký một luật kiểm tra context */
    registerRule(rule: PermissionRule): void;
    /** Kiểm tra quyền truy cập tool kèm theo PermissionContext */
    checkPermission(toolName: string, context?: PermissionContext): {
        level: PermissionLevel;
        autoApprove: boolean;
    };
    /** Đăng ký danh sách các tool được phép sử dụng ở một step nhất định */
    registerStepFilter(stepIndex: number, allowedTools: string[]): void;
    /** Trả về danh sách các tool khả dụng cho stepIndex hiện tại */
    filterActiveTools(stepIndex: number): string[];
    /** Lấy permission level của tool */
    getLevel(toolName: string): PermissionLevel;
    /** Kiểm tra tool có auto-approve không */
    isAutoApprove(toolName: string): boolean;
    /** Cập nhật permission cho tool */
    setPermission(tool: string, level: PermissionLevel, autoApprove?: boolean): void;
    /** Lấy tất cả permissions */
    getAll(): ToolPermission[];
    /** Lấy permissions theo level */
    getByLevel(level: PermissionLevel): ToolPermission[];
    /** Kiểm tra tool có phải destructive không */
    isDestructive(toolName: string): boolean;
}
//# sourceMappingURL=permissions.d.ts.map