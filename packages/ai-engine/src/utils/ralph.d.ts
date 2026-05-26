import type { ChatMessage, TokenUsage } from '../types.js';
import type { Orchestrator } from '../orchestrator.js';
export interface RalphLoopConfig {
    maxIterations: number;
    costLimitUsd: number;
    compileCommand?: string;
    testCommand?: string;
}
export interface RalphLoopState {
    currentIteration: number;
    totalTokensUsed: TokenUsage;
    totalCostUsd: number;
    success: boolean;
    history: ChatMessage[];
    errorLogs?: string;
}
export declare class RalphLoopManager {
    private orchestrator;
    private config;
    private readonly PRICE_PER_1K_INPUT;
    private readonly PRICE_PER_1K_OUTPUT;
    constructor(orchestrator: Orchestrator, config?: Partial<RalphLoopConfig>);
    /**
     * Tính toán chi phí thực tế tiêu hao dựa trên lượng Token sử dụng
     */
    calculateCost(usage: TokenUsage): number;
    /**
     * Chạy vòng lặp tự sửa sai AI (Ralph Loop)
     * @param task Mô tả tác vụ cần thực hiện
     * @param executeAction Hàm gọi chạy lệnh compile/test thực tế để trả về kết quả
     * @param onProgress Callback thông báo tiến trình cho UI
     */
    run(task: string, executeAction: (code: string) => Promise<{
        success: boolean;
        logs: string;
    }>, onProgress: (status: {
        iteration: number;
        cost: number;
        message: string;
        code?: string;
    }) => void): Promise<RalphLoopState>;
}
//# sourceMappingURL=ralph.d.ts.map