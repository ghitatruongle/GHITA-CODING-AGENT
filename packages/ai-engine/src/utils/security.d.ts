export interface SecurityScanResult {
    safe: boolean;
    reason?: string;
    threatLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
export declare class SecurityGuard {
    /**
     * Rà soát tính an toàn của một câu lệnh CLI / Bash trước khi chạy
     */
    static scanCommand(command: string): SecurityScanResult;
    /**
     * Rà soát tham số của một Tool sử dụng
     */
    static scanToolUse(toolName: string, args: any): SecurityScanResult;
    private static extractStringValues;
}
//# sourceMappingURL=security.d.ts.map