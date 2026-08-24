import type { PermissionContext } from '../types.js';

export type PermissionLevel = 'read_only' | 'write' | 'destructive';

/** Tool permission mapping */
export interface ToolPermission {
  tool: string;
  level: PermissionLevel;
  autoApprove?: boolean;
}

/** Default permission mapping */
const DEFAULT_PERMISSIONS: ToolPermission[] = [
  
  { tool: 'read_file', level: 'read_only', autoApprove: true },
  { tool: 'glob', level: 'read_only', autoApprove: true },
  { tool: 'grep', level: 'read_only', autoApprove: true },
  { tool: 'web_search', level: 'read_only', autoApprove: true },
  { tool: 'web_fetch', level: 'read_only', autoApprove: true },
  { tool: 'list_directory', level: 'read_only', autoApprove: true },
  { tool: 'get_file_info', level: 'read_only', autoApprove: true },

  { tool: 'write_file', level: 'write' },
  { tool: 'edit_file', level: 'write' },
  { tool: 'create_file', level: 'write' },
  { tool: 'bash', level: 'write' },
  { tool: 'terminal_run', level: 'write' },

  { tool: 'delete_file', level: 'destructive' },
  { tool: 'rm', level: 'destructive' },
  { tool: 'git_reset_hard', level: 'destructive' },
  { tool: 'drop_table', level: 'destructive' },
];

export type PermissionRule = (
  toolName: string,
  context?: PermissionContext,
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

  registerRule(rule: PermissionRule): void {
    this.rules.push(rule);
  }

  checkPermission(
    toolName: string,
    context?: PermissionContext,
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

  registerStepFilter(stepIndex: number, allowedTools: string[]): void {
    this.stepFilters.set(stepIndex, allowedTools);
  }

  filterActiveTools(stepIndex: number): string[] {
    if (this.stepFilters.has(stepIndex)) {
      return this.stepFilters.get(stepIndex) ?? [];
    }
    return Array.from(this.permissions.keys());
  }

  getLevel(toolName: string): PermissionLevel {
    return this.permissions.get(toolName)?.level ?? 'write';
  }

  isAutoApprove(toolName: string): boolean {
    return this.permissions.get(toolName)?.autoApprove ?? false;
  }

  setPermission(tool: string, level: PermissionLevel, autoApprove?: boolean): void {
    this.permissions.set(tool, { tool, level, autoApprove });
  }

  getAll(): ToolPermission[] {
    return [...this.permissions.values()];
  }

  getByLevel(level: PermissionLevel): ToolPermission[] {
    return [...this.permissions.values()].filter((p) => p.level === level);
  }

  isDestructive(toolName: string): boolean {
    return this.getLevel(toolName) === 'destructive';
  }
}
