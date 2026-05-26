// ==============================================================================
// GHITA CODING AGENT - AI Engine Package Entry
// ==============================================================================

// --- Types ---
export type {
  AIProvider,
  ChatMessage,
  ChatRole,
  ChatOptions,
  ChatResponse,
  TokenUsage,
  ProviderConfig,
  OrchestratorConfig,
  OrchestratorStatus,
  KeyRotationStrategy,
} from './types.js';

// --- Phase 1.1: Multi-Key Manager ---
export { KeyManager } from './key-manager.js';
export type { KeyEntry, KeyHealthStatus, KeyUsageStats } from './key-manager.js';

// --- Phase 1.3: Model Discovery ---
export { ModelDiscovery, parseOpenAICompat, parseOllamaTags, parseGoogleModels, parseReplicateModels } from './discovery/model-discovery.js';
export type { ModelInfo, DiscoveryResult, DiscoveryConfig } from './discovery/types.js';

// --- Phase 1.4: Smart Router ---
export { SmartRouter } from './routing/smart-router.js';
export type { RoutingStrategy, RoutingDecision, RoutingConfig, ProviderMetrics } from './routing/types.js';

// --- Providers ---
export { BaseProvider } from './providers/base.js';
export { OpenAIProvider } from './providers/openai.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { GoogleProvider } from './providers/google.js';
export { OllamaProvider } from './providers/ollama.js';
export { CustomProvider } from './providers/custom.js';

// --- Registry & Orchestrator ---
export { ProviderRegistry } from './registry.js';
export { Orchestrator } from './orchestrator.js';

// --- gRPC Server ---
export { GrpcServer } from './grpc/server.js';

// --- Configuration Loader ---
export { ConfigLoader } from './utils/configLoader.js';
export type { LocalConfig } from './utils/configLoader.js';

// --- Security Guard ---
export { SecurityGuard } from './utils/security.js';
export type { SecurityScanResult } from './utils/security.js';

// --- Cryptography Helper ---
export { CryptoHelper } from './utils/crypto.js';

// --- Ralph Loop Manager ---
export { RalphLoopManager } from './utils/ralph.js';
export type { RalphLoopConfig, RalphLoopState } from './utils/ralph.js';

// --- MCP (Model Context Protocol) ---
export { MCPClient } from './mcp/client.js';
export { StdioTransport, SSETransport, createTransport } from './mcp/transport.js';
export type { MCPServerConfig, MCPTool, MCPToolResult, MCPServerStatus, MCPConfig, MCPTransportType } from './mcp/types.js';

// --- Hooks ---
export { HookRunner } from './hooks/runner.js';
export type { HookConfig, HookEvent, HookResult, HookRunnerConfig, HookMatcher } from './hooks/types.js';

// --- Built-in Tools ---
export { WebSearchTool, WebFetchTool, createBuiltInTools } from './tools/index.js';
export type { SearchResult, SearchResponse } from './tools/index.js';
export type { FetchResponse } from './tools/index.js';
export type { BuiltInTool } from './tools/index.js';

// --- Context Manager ---
export { ContextManager } from './context/manager.js';
export type { ContextConfig } from './context/manager.js';
export { TrajectoryCompressor } from './context/compressor.js';
export type { CompressionResult, CompressorConfig, MessageAnalysis, MessageImportance } from './context/compressor.js';

// --- Permission Manager ---
export { PermissionManager } from './security/permissions.js';
export type { PermissionLevel, ToolPermission } from './security/permissions.js';

// --- Security Checkers & Safety Hooks ---
export { SecurityChecker } from './hooks/security-checkers.js';
export type { SecurityAnalysis, SecurityRiskLevel } from './hooks/security-checkers.js';

// --- Errors ---
export {
  AIBaseError,
  AIAPIError,
  AIValidationError,
  AITimeoutError,
  AIRateLimitError,
  AIInvalidConfigError,
  AINoProviderError,
  AIToolCallRepairError,
  AIPermissionDeniedError,
  AISecurityGuardrailError,
  AIUnsupportedFeatureError,
  AIBudgetExceededError,
} from './errors/index.js';

// --- Caching System ---
export { InMemoryCache, RedisCache, SemanticCache } from './utils/cache.js';
export type { BaseCache, SemanticCacheOptions } from './utils/cache.js';

// --- Phase 3.2: Token Counter ---
export { estimateTokens, estimateMessagesTokens, fitsInContext, truncateToFit, getContextInfo } from './utils/token-counter.js';
export type { ContextWindow } from './utils/token-counter.js';

// --- Cost & Budget ---
export { CostTracker, BudgetManager, DEFAULT_PRICING_TABLE, getModelPricing } from './utils/cost.js';
export type { ModelPricing, BudgetOptions } from './utils/cost.js';

// --- Prompt System ---
export {
  PromptTemplate,
  ChatPromptTemplate,
  FewShotPromptTemplate,
  PipelinePromptTemplate,
  PromptManager,
  renderTemplate,
} from './utils/prompt.js';
export type { ChatMessageTemplate, FewShotPromptOptions } from './utils/prompt.js';

// --- Middleware Pipeline ---
export {
  wrapLanguageModel,
  composeMiddlewares,
  wrapEmbeddingModel,
  wrapImageModel,
  wrapProvider,
} from './utils/middleware.js';
export type {
  ChatMiddleware,
  ChatStreamMiddleware,
  EmbeddingMiddleware,
  EmbeddingManyMiddleware,
  ImageMiddleware,
  IProviderMiddlewares,
} from './utils/middleware.js';

// --- Universal Chat Model Router ---
export { UniversalChatModel } from './utils/universal.js';
export type { UniversalChatModelOptions } from './utils/universal.js';

// --- Unified Chat Model Router (Phase 15) ---
export { UnifiedRouter } from './router/unifiedRouter.js';
export type { UnifiedRouterOptions, LatencyMetric } from './router/unifiedRouter.js';

// --- API Cost Tracker & Usage Failover Manager (Phase 16) ---
export { FallbackManager, MODEL_PRICING } from './gateway/fallbackManager.js';
export type { BudgetConfig, CostRecord } from './gateway/fallbackManager.js';

// --- Output Parsers ---
export {
  JSONOutputParser,
  XMLOutputParser,
  ListOutputParser,
  StructuredOutputParser,
} from './utils/parsers.js';
export type { BaseOutputParser } from './utils/parsers.js';

// --- Enterprise Infrastructure (Phase 3) ---
export {
  // Auth
  APIKeyManager,
  // Rate Limiting
  RateLimiter,
  DEFAULT_RATE_LIMIT_TIERS,
  // SSO
  SSOManager,
  // Teams
  TeamManager,
  // Content Filtering
  ContentFilter,
  // PII Detection
  PIIDetector,
  // LLM-as-Judge
  LLMJudge,
  DEFAULT_JUDGE_RULES,
  // Secret Detection
  SecretDetector,
  // Audit Logging
  AuditLogger,
  // Observability
  ObservabilityManager,
  // Alerting
  AlertingManager,
  createBudgetAlertRule,
  createErrorRateAlertRule,
  createLatencyAlertRule,
  createSecurityAlertRule,
} from './enterprise/index.js';

export type {
  // Auth types
  AuthMethod,
  APIKeyConfig,
  APIKeyEntry,
  AuthScope,
  JWTClaims,
  AuthResult,
  AuthMiddlewareOptions,
  // Rate Limiting types
  RateLimitScope,
  RateLimitConfig,
  RateLimitState,
  RateLimitResult,
  RateLimitTier,
  // SSO types
  SSOProvider,
  SSOConfig,
  SSOTokenResponse,
  SSOUserInfo,
  SSOState,
  // Teams types
  TeamRole,
  ProjectStatus,
  Team,
  TeamMember,
  Project,
  User,
  Invitation,
  // Content Filter types
  FilterAction,
  ContentDirection,
  ContentCategory,
  ContentFilterRule,
  ContentFilterResult,
  ModerationResult,
  // PII types
  PIIType,
  PIIAction,
  PIIDetectionResult,
  PIIFinding,
  PIIConfig,
  // LLM Judge types
  JudgeTask,
  JudgeConfig,
  JudgeResult,
  JudgeRule,
  // Secret Detection types
  SecretType,
  SecretProvider,
  SecretFinding,
  SecretDetectionResult,
  SecretPattern,
  // Audit types
  AuditAction,
  AuditSeverity,
  AuditEvent,
  AuditQuery,
  AuditConfig,
  AuditStats,
  // Observability types
  ObservabilityProvider,
  TraceSpan,
  TraceEvent,
  Trace,
  LLMCallMetrics,
  ObservabilityConfig,
  // Alerting types
  AlertChannel,
  AlertCategory,
  AlertRule,
  AlertContext,
  Alert,
  SlackConfig,
  EmailConfig,
  PagerDutyConfig,
  WebhookConfig,
  AlertingConfig,
} from './enterprise/index.js';

// --- Phase 10: Anti-Slop Output Filtration ---
export {
  AntiSlopFilter,
  createAntiSlopStreamMiddleware,
  createAntiSlopMiddleware,
  cleanSlop,
} from './middleware/antiSlop.js';
export type { AntiSlopConfig } from './middleware/antiSlop.js';

// --- Phase 3.3: Guardrails Middleware ---
export {
  createContentFilterMiddleware,
  createPIIDetectorMiddleware,
  createPIIDetectorStreamMiddleware,
  createSecretDetectorMiddleware,
  createRateLimiterMiddleware,
  createAuditLoggerMiddleware,
  createGuardrailsMiddlewares,
} from './middleware/guardrails.js';
export type {
  GuardrailsConfig,
  ContentFilterConfig,
  PIIDetectorConfig,
  SecretDetectorConfig,
  RateLimiterConfig,
  AuditLoggerConfig,
  AuditEntry,
} from './middleware/guardrails.js';

// --- Phase 9: SCTI (Self-Correcting Trajectory Injection) ---
export {
  SCTIEngine,
  injectSctiTrajectories,
  createSctiMiddleware,
  createSctiStreamMiddleware,
  extractErrorCode,
  getJaccardSimilarity,
  compressDiff,
} from './middleware/sctiCalibrator.js';
export type { SCTITrajectory } from './middleware/sctiCalibrator.js';

// --- Phase 5: Advanced & Platform ---
export { FineTuningManager } from './platform/fine-tuning.js';
export { FilesManager, BatchesManager } from './platform/files-batches.js';
export { RealtimeProxy } from './platform/realtime.js';
export { LLMEvaluator, IntegratedSearchClient } from './platform/evals.js';
export type { EvalResult } from './platform/evals.js';
export { AIGatewayServer } from './platform/gateway.js';
export type { GatewayConfig } from './platform/gateway.js';
export { OCRProcessor, VideoContentAnalyzer } from './platform/ocr-video.js';
export { DashboardController } from './platform/dashboard-controller.js';
export type { DashboardStats } from './platform/dashboard-controller.js';
export { DeployConfigGenerator } from './platform/prometheus.js';

