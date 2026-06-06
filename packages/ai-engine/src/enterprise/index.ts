// ==============================================================================
// GHITA CODING AGENT - Enterprise Infrastructure Module
// Phase 3: Security, Auth, Guardrails, Observability, Alerting
// ==============================================================================

// --- 3.1 API Key Authentication ---
export { APIKeyManager } from './auth.js';
export type {
  AuthMethod,
  APIKeyConfig,
  APIKeyEntry,
  AuthScope,
  JWTClaims,
  AuthResult,
  AuthMiddlewareOptions,
} from './auth.js';

// --- 3.2 Rate Limiting ---
export { RateLimiter, DEFAULT_RATE_LIMIT_TIERS } from './rate-limit.js';
export type {
  RateLimitScope,
  RateLimitConfig,
  RateLimitState,
  RateLimitResult,
  RateLimitTier,
} from './rate-limit.js';

// --- 3.3 SSO Integration ---
export { SSOManager } from './sso.js';
export type { SSOProvider, SSOConfig, SSOTokenResponse, SSOUserInfo, SSOState } from './sso.js';

// --- 3.4 Teams & Projects ---
export { TeamManager } from './teams.js';
export type {
  TeamRole,
  ProjectStatus,
  Team,
  TeamMember,
  Project,
  User,
  Invitation,
} from './teams.js';

// --- 3.5 Content Filtering ---
export { ContentFilter } from './content-filter.js';
export type {
  FilterAction,
  ContentDirection,
  ContentCategory,
  ContentFilterRule,
  ContentFilterResult,
  ModerationResult,
} from './content-filter.js';

// --- 3.6 PII Detection ---
export { PIIDetector } from './pii-detection.js';
export type {
  PIIType,
  PIIAction,
  PIIDetectionResult,
  PIIFinding,
  PIIConfig,
} from './pii-detection.js';

// --- 3.7 LLM-as-Judge ---
export { LLMJudge, DEFAULT_JUDGE_RULES } from './llm-judge.js';
export type { JudgeTask, JudgeConfig, JudgeResult, JudgeRule } from './llm-judge.js';

// --- 3.8 Secret Detection ---
export { SecretDetector } from './secret-detection.js';
export type {
  SecretType,
  SecretProvider,
  SecretFinding,
  SecretDetectionResult,
  SecretPattern,
} from './secret-detection.js';

// --- 3.9 Audit Logging ---
export { AuditLogger } from './audit.js';
export type {
  AuditAction,
  AuditSeverity,
  AuditEvent,
  AuditQuery,
  AuditConfig,
  AuditStats,
} from './audit.js';

// --- 3.10 Observability ---
export { ObservabilityManager } from './observability.js';
export type {
  ObservabilityProvider,
  TraceSpan,
  TraceEvent,
  Trace,
  LLMCallMetrics,
  ObservabilityConfig,
} from './observability.js';

// --- 3.11 Alerting ---
export {
  AlertingManager,
  createBudgetAlertRule,
  createErrorRateAlertRule,
  createLatencyAlertRule,
  createSecurityAlertRule,
} from './alerting.js';
export type {
  AlertChannel,
  AlertSeverity,
  AlertCategory,
  AlertRule,
  AlertContext,
  Alert,
  SlackConfig,
  EmailConfig,
  PagerDutyConfig,
  WebhookConfig,
  AlertingConfig,
} from './alerting.js';
