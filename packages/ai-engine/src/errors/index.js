// ==============================================================================
// GHITA CODING AGENT - Custom Error Hierarchy
// ==============================================================================
export class AIBaseError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.name = this.constructor.name;
        this.cause = cause;
        // Restore prototype chain
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
export class AIAPIError extends AIBaseError {
    provider;
    status;
    details;
    constructor(provider, message, status, details) {
        super(`[${provider} API Error] ${message}`);
        this.provider = provider;
        this.status = status;
        this.details = details;
    }
}
export class AIValidationError extends AIBaseError {
    schemaDescription;
    errors;
    rawResponse;
    constructor(schemaDescription, rawResponse, errors, message = 'Structured output validation failed') {
        super(`${message}: ${schemaDescription}`);
        this.schemaDescription = schemaDescription;
        this.rawResponse = rawResponse;
        this.errors = errors;
    }
}
export class AITimeoutError extends AIBaseError {
    timeoutMs;
    constructor(timeoutMs, message = 'AI Engine request timed out') {
        super(`${message} after ${timeoutMs}ms`);
        this.timeoutMs = timeoutMs;
    }
}
export class AIRateLimitError extends AIBaseError {
    provider;
    limit;
    remaining;
    resetTime;
    constructor(provider, message = 'Rate limit exceeded', limit, remaining, resetTime) {
        super(`[${provider} Rate Limit] ${message}`);
        this.provider = provider;
        this.limit = limit;
        this.remaining = remaining;
        this.resetTime = resetTime;
    }
}
export class AIInvalidConfigError extends AIBaseError {
    constructor(message) {
        super(`Invalid Config: ${message}`);
    }
}
export class AINoProviderError extends AIBaseError {
    constructor(message = 'No AI providers available or ready') {
        super(message);
    }
}
export class AIToolCallRepairError extends AIBaseError {
    rawResponse;
    attempts;
    toolErrors;
    constructor(rawResponse, attempts, toolErrors, message = 'Failed to repair tool call output') {
        super(`${message} after ${attempts} attempts`);
        this.rawResponse = rawResponse;
        this.attempts = attempts;
        this.toolErrors = toolErrors;
    }
}
export class AIPermissionDeniedError extends AIBaseError {
    toolName;
    reason;
    constructor(toolName, reason) {
        super(`Permission denied for tool "${toolName}": ${reason}`);
        this.toolName = toolName;
        this.reason = reason;
    }
}
export class AISecurityGuardrailError extends AIBaseError {
    threatType;
    details;
    constructor(threatType, details, message = 'Security guardrail violation detected') {
        super(`${message} (${threatType})`);
        this.threatType = threatType;
        this.details = details;
    }
}
export class AIUnsupportedFeatureError extends AIBaseError {
    provider;
    feature;
    constructor(provider, feature) {
        super(`Provider "${provider}" does not support feature "${feature}"`);
        this.provider = provider;
        this.feature = feature;
    }
}
export class AIBudgetExceededError extends AIBaseError {
    limit;
    currentSpent;
    period;
    constructor(limit, currentSpent, period = 'monthly') {
        super(`AI spending budget exceeded. Limit: $${limit}, Current Spent: $${currentSpent} (${period})`);
        this.limit = limit;
        this.currentSpent = currentSpent;
        this.period = period;
    }
}
//# sourceMappingURL=index.js.map