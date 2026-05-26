import type { HookResult } from './types.js';
export type SecurityRiskLevel = 'safe' | 'warning' | 'critical';
export interface SecurityAnalysis {
    riskLevel: SecurityRiskLevel;
    explanation: string;
    blocked: boolean;
}
export declare class SecurityChecker {
    /**
     * Phân tích câu lệnh shell (dành cho terminal.run)
     */
    checkCommand(command: string): SecurityAnalysis;
    /**
     * Phân tích nội dung ghi file (dành cho file.write)
     */
    checkFileWrite(path: string, content: string): SecurityAnalysis;
    /**
     * Đăng ký bộ checker này thành một PreTool hook trong orchestrator
     */
    createPreToolHook(): {
        event: 'pre_tool';
        matcher: {
            tool: string;
        };
        command: string;
        enabled: boolean;
        handler: (toolName: string, args: Record<string, unknown>) => Promise<HookResult>;
    };
}
//# sourceMappingURL=security-checkers.d.ts.map