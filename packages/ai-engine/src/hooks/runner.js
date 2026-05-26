// ==============================================================================
// GHITA CODING AGENT - Hook Runner
// ==============================================================================
export class HookRunner {
    hooks = [];
    enabled = true;
    constructor(config) {
        if (config) {
            this.hooks = config.hooks ?? [];
            this.enabled = config.enabled ?? true;
        }
    }
    /** Load hooks từ config */
    loadHooks(hooks) {
        this.hooks = hooks;
    }
    /** Thêm hook */
    addHook(hook) {
        this.hooks.push(hook);
    }
    /** Xóa hook theo index */
    removeHook(index) {
        this.hooks.splice(index, 1);
    }
    /** Bật/tắt hook system */
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    /** Kiểm tra hook có enabled không */
    isEnabled() {
        return this.enabled;
    }
    /** Lấy danh sách hooks */
    getHooks() {
        return [...this.hooks];
    }
    /** Chạy tất cả hooks matching cho một event */
    async runHooks(event, toolName, toolArgs, toolResult) {
        if (!this.enabled)
            return [];
        const matching = this.hooks.filter((h) => h.enabled && h.event === event && this.matches(h, toolName));
        const results = [];
        for (const hook of matching) {
            const result = await this.executeHook(hook, toolName, toolArgs, toolResult);
            results.push(result);
        }
        return results;
    }
    /** Kiểm tra hook matcher có match với tool không */
    matches(hook, toolName) {
        if (!hook.matcher.tool && !hook.matcher.glob)
            return true;
        if (hook.matcher.tool && hook.matcher.tool !== toolName)
            return false;
        // glob matching for future extension
        return true;
    }
    /** Thực thi một hook */
    async executeHook(hook, toolName, toolArgs, toolResult) {
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
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                durationMs: Date.now() - start,
            };
        }
    }
}
//# sourceMappingURL=runner.js.map