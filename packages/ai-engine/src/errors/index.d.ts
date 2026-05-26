export declare class AIBaseError extends Error {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown);
}
export declare class AIAPIError extends AIBaseError {
    readonly provider: string;
    readonly status?: number;
    readonly details?: unknown;
    constructor(provider: string, message: string, status?: number, details?: unknown);
}
export declare class AIValidationError extends AIBaseError {
    readonly schemaDescription: string;
    readonly errors: unknown[];
    readonly rawResponse: string;
    constructor(schemaDescription: string, rawResponse: string, errors: unknown[], message?: string);
}
export declare class AITimeoutError extends AIBaseError {
    readonly timeoutMs: number;
    constructor(timeoutMs: number, message?: string);
}
export declare class AIRateLimitError extends AIBaseError {
    readonly provider: string;
    readonly limit?: number;
    readonly remaining?: number;
    readonly resetTime?: Date;
    constructor(provider: string, message?: string, limit?: number, remaining?: number, resetTime?: Date);
}
export declare class AIInvalidConfigError extends AIBaseError {
    constructor(message: string);
}
export declare class AINoProviderError extends AIBaseError {
    constructor(message?: string);
}
export declare class AIToolCallRepairError extends AIBaseError {
    readonly rawResponse: string;
    readonly attempts: number;
    readonly toolErrors: unknown[];
    constructor(rawResponse: string, attempts: number, toolErrors: unknown[], message?: string);
}
export declare class AIPermissionDeniedError extends AIBaseError {
    readonly toolName: string;
    readonly reason: string;
    constructor(toolName: string, reason: string);
}
export declare class AISecurityGuardrailError extends AIBaseError {
    readonly threatType: string;
    readonly details?: unknown;
    constructor(threatType: string, details?: unknown, message?: string);
}
export declare class AIUnsupportedFeatureError extends AIBaseError {
    readonly provider: string;
    readonly feature: string;
    constructor(provider: string, feature: string);
}
export declare class AIBudgetExceededError extends AIBaseError {
    readonly limit: number;
    readonly currentSpent: number;
    readonly period: string;
    constructor(limit: number, currentSpent: number, period?: string);
}
//# sourceMappingURL=index.d.ts.map