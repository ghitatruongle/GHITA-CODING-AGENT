// ==============================================================================
// GHITA CODING AGENT - Permission Levels System
// ==============================================================================

import type { PermissionContext } from '../types.js';

/** 3 cấp độ permission */
export type PermissionLevel = 'read_only' | 'write' | 'destructive';

/** Tool permission mapping */
export interface ToolPermission {
  tool: string;
  level: PermissionLevel;
  autoApprove?: boolean;
}

/** Default permission mapping */
const DEFAULT_PERMISSIONS: ToolPermission[] = [
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

export type PermissionRule = (
  toolName: string,
  context?: PermissionContext
) => boolean | { level?: PermissionLevel; autoApprove?: boolean } | undefined;

export class PermissionManager {
  private permissions: Map<string, ToolPermission> = new Map();
  private rules: PermissionRule[] = [];
  private stepFilters: Map<number, string[]> = new Map();

  constructor() {
    this.loadDefaults();
  }

  /** Load default permissions */
  private loadDefaults(): void {
    for (const perm of DEFAULT_PERMISSIONS) {
      this.permissions.set(perm.tool, perm);
    }
  }

  /** Đăng ký một luật kiểm tra context */
  registerRule(rule: PermissionRule): void {
    this.rules.push(rule);
  }

  /** Kiểm tra quyền truy cập tool kèm theo PermissionContext */
  checkPermission(
    toolName: string,
    context?: PermissionContext
  ): { level: PermissionLevel; autoApprove: boolean } {
    let level = this.getLevel(toolName);
    let autoApprove = this.isAutoApprove(toolName);

    for (const rule of this.rules) {
      const decision = rule(toolName, context);
      if (decision !== undefined) {
        if (typeof decision === 'boolean') {
          autoApprove = decision;
        } else {
          if (decision.level !== undefined) level = decision.level;
          if (decision.autoApprove !== undefined) autoApprove = decision.autoApprove;
        }
      }
    }

    return { level, autoApprove };
  }

  /** Đăng ký danh sách các tool được phép sử dụng ở một step nhất định */
  registerStepFilter(stepIndex: number, allowedTools: string[]): void {
    this.stepFilters.set(stepIndex, allowedTools);
  }

  /** Trả về danh sách các tool khả dụng cho stepIndex hiện tại */
  filterActiveTools(stepIndex: number): string[] {
    if (this.stepFilters.has(stepIndex)) {
      return this.stepFilters.get(stepIndex)!;
    }
    return Array.from(this.permissions.keys());
  }

  /** Lấy permission level của tool */
  getLevel(toolName: string): PermissionLevel {
    return this.permissions.get(toolName)?.level ?? 'write';
  }

  /** Kiểm tra tool có auto-approve không */
  isAutoApprove(toolName: string): boolean {
    return this.permissions.get(toolName)?.autoApprove ?? false;
  }

  /** Cập nhật permission cho tool */
  setPermission(tool: string, level: PermissionLevel, autoApprove?: boolean): void {
    this.permissions.set(tool, { tool, level, autoApprove });
  }

  /** Lấy tất cả permissions */
  getAll(): ToolPermission[] {
    return [...this.permissions.values()];
  }

  /** Lấy permissions theo level */
  getByLevel(level: PermissionLevel): ToolPermission[] {
    return [...this.permissions.values()].filter((p) => p.level === level);
  }

  /** Kiểm tra tool có phải destructive không */
  isDestructive(toolName: string): boolean {
    return this.getLevel(toolName) === 'destructive';
  }
}
