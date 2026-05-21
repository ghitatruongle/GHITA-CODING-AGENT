// ==============================================================================
// GHITA CODING AGENT - Permission Levels System
// ==============================================================================

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

export class PermissionManager {
  private permissions: Map<string, ToolPermission> = new Map();

  constructor() {
    this.loadDefaults();
  }

  /** Load default permissions */
  private loadDefaults(): void {
    for (const perm of DEFAULT_PERMISSIONS) {
      this.permissions.set(perm.tool, perm);
    }
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
