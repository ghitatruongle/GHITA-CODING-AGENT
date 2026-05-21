// ==============================================================================
// GHITA CODING AGENT - Hook Runner
// ==============================================================================

import type { HookConfig, HookEvent, HookResult, HookRunnerConfig } from './types.js';

export class HookRunner {
  private hooks: HookConfig[] = [];
  private enabled = true;

  constructor(config?: HookRunnerConfig) {
    if (config) {
      this.hooks = config.hooks ?? [];
      this.enabled = config.enabled ?? true;
    }
  }

  /** Load hooks từ config */
  loadHooks(hooks: HookConfig[]): void {
    this.hooks = hooks;
  }

  /** Thêm hook */
  addHook(hook: HookConfig): void {
    this.hooks.push(hook);
  }

  /** Xóa hook theo index */
  removeHook(index: number): void {
    this.hooks.splice(index, 1);
  }

  /** Bật/tắt hook system */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Kiểm tra hook có enabled không */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Lấy danh sách hooks */
  getHooks(): HookConfig[] {
    return [...this.hooks];
  }

  /** Chạy tất cả hooks matching cho một event */
  async runHooks(
    event: HookEvent,
    toolName: string,
    toolArgs?: Record<string, unknown>,
    toolResult?: string,
  ): Promise<HookResult[]> {
    if (!this.enabled) return [];

    const matching = this.hooks.filter(
      (h) => h.enabled && h.event === event && this.matches(h, toolName),
    );

    const results: HookResult[] = [];
    for (const hook of matching) {
      const result = await this.executeHook(hook, toolName, toolArgs, toolResult);
      results.push(result);
    }
    return results;
  }

  /** Kiểm tra hook matcher có match với tool không */
  private matches(hook: HookConfig, toolName: string): boolean {
    if (!hook.matcher.tool && !hook.matcher.glob) return true;
    if (hook.matcher.tool && hook.matcher.tool !== toolName) return false;
    // glob matching for future extension
    return true;
  }

  /** Thực thi một hook */
  private async executeHook(
    hook: HookConfig,
    toolName: string,
    toolArgs?: Record<string, unknown>,
    toolResult?: string,
  ): Promise<HookResult> {
    const start = Date.now();
    try {
      if (hook.handler) {
        return await hook.handler(toolName, toolArgs ?? {}, toolResult);
      }
      // Substitute variables in command
      let command = hook.command;
      command = command.replace(/\$TOOL_NAME/g, toolName);
      command = command.replace(/\$TOOL_ARGS/g, JSON.stringify(toolArgs ?? {}));
      if (toolResult) {
        command = command.replace(/\$TOOL_RESULT/g, toolResult);
      }

      // In sidecar context, this would use child_process.exec
      // For now, return success with the resolved command
      return {
        success: true,
        output: `[Hook] Would execute: ${command}`,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }
}
