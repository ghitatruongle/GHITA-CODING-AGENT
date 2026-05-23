// ==============================================================================
// GHITA CODING AGENT - Custom Error Hierarchy
// ==============================================================================

export class AIBaseError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
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
  readonly provider: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(provider: string, message: string, status?: number, details?: unknown) {
    super(`[${provider} API Error] ${message}`);
    this.provider = provider;
    this.status = status;
    this.details = details;
  }
}

export class AIValidationError extends AIBaseError {
  readonly schemaDescription: string;
  readonly errors: unknown[];
  readonly rawResponse: string;

  constructor(schemaDescription: string, rawResponse: string, errors: unknown[], message = 'Structured output validation failed') {
    super(`${message}: ${schemaDescription}`);
    this.schemaDescription = schemaDescription;
    this.rawResponse = rawResponse;
    this.errors = errors;
  }
}

export class AITimeoutError extends AIBaseError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, message = 'AI Engine request timed out') {
    super(`${message} after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
  }
}

export class AIRateLimitError extends AIBaseError {
  readonly provider: string;
  readonly limit?: number;
  readonly remaining?: number;
  readonly resetTime?: Date;

  constructor(provider: string, message = 'Rate limit exceeded', limit?: number, remaining?: number, resetTime?: Date) {
    super(`[${provider} Rate Limit] ${message}`);
    this.provider = provider;
    this.limit = limit;
    this.remaining = remaining;
    this.resetTime = resetTime;
  }
}

export class AIInvalidConfigError extends AIBaseError {
  constructor(message: string) {
    super(`Invalid Config: ${message}`);
  }
}

export class AINoProviderError extends AIBaseError {
  constructor(message = 'No AI providers available or ready') {
    super(message);
  }
}

export class AIToolCallRepairError extends AIBaseError {
  readonly rawResponse: string;
  readonly attempts: number;
  readonly toolErrors: unknown[];

  constructor(rawResponse: string, attempts: number, toolErrors: unknown[], message = 'Failed to repair tool call output') {
    super(`${message} after ${attempts} attempts`);
    this.rawResponse = rawResponse;
    this.attempts = attempts;
    this.toolErrors = toolErrors;
  }
}

export class AIPermissionDeniedError extends AIBaseError {
  readonly toolName: string;
  readonly reason: string;

  constructor(toolName: string, reason: string) {
    super(`Permission denied for tool "${toolName}": ${reason}`);
    this.toolName = toolName;
    this.reason = reason;
  }
}

export class AISecurityGuardrailError extends AIBaseError {
  readonly threatType: string;
  readonly details?: unknown;

  constructor(threatType: string, details?: unknown, message = 'Security guardrail violation detected') {
    super(`${message} (${threatType})`);
    this.threatType = threatType;
    this.details = details;
  }
}

export class AIUnsupportedFeatureError extends AIBaseError {
  readonly provider: string;
  readonly feature: string;

  constructor(provider: string, feature: string) {
    super(`Provider "${provider}" does not support feature "${feature}"`);
    this.provider = provider;
    this.feature = feature;
  }
}

export class AIBudgetExceededError extends AIBaseError {
  readonly limit: number;
  readonly currentSpent: number;
  readonly period: string;

  constructor(limit: number, currentSpent: number, period = 'monthly') {
    super(`AI spending budget exceeded. Limit: $${limit}, Current Spent: $${currentSpent} (${period})`);
    this.limit = limit;
    this.currentSpent = currentSpent;
    this.period = period;
  }
}
