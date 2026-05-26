import type { HookConfig, HookEvent, HookResult, HookRunnerConfig } from './types.js';
export declare class HookRunner {
    private hooks;
    private enabled;
    constructor(config?: HookRunnerConfig);
    /** Load hooks từ config */
    loadHooks(hooks: HookConfig[]): void;
    /** Thêm hook */
    addHook(hook: HookConfig): void;
    /** Xóa hook theo index */
    removeHook(index: number): void;
    /** Bật/tắt hook system */
    setEnabled(enabled: boolean): void;
    /** Kiểm tra hook có enabled không */
    isEnabled(): boolean;
    /** Lấy danh sách hooks */
    getHooks(): HookConfig[];
    /** Chạy tất cả hooks matching cho một event */
    runHooks(event: HookEvent, toolName: string, toolArgs?: Record<string, unknown>, toolResult?: string): Promise<HookResult[]>;
    /** Kiểm tra hook matcher có match với tool không */
    private matches;
    /** Thực thi một hook */
    private executeHook;
}
//# sourceMappingURL=runner.d.ts.map