// --- Types ---
export type {
  PluginManifest,
  PluginCategory,
  PluginTool,
  PluginPermission,
  InstalledPlugin,
  LockfileEntry,
  PluginLockfile,
  ResolvedDependency,
  DependencyGraph,
  DependencyConflict,
  RegistrySearchResult,
  RegistrySearchFilters,
  InstallOptions,
  CLIResult,
  MarketplaceConfig,
} from './types.js';

// --- Manifest Validation ---
export {
  PluginManifestSchema,
  validateManifest,
  safeValidateManifest,
  manifestFromPackageJson,
  compareSemver,
  satisfiesRange,
} from './manifest.js';

// --- Dependency Resolver ---
export {
  resolveDependencies,
  flattenResolution,
  hasConflicts,
  resolveConflicts,
  detectCircularDependencies,
} from './resolver.js';

// --- Lockfile Manager ---
export { LockfileManager } from './lockfile.js';

// --- Registry API ---
export { MarketplaceRegistry } from './registry.js';

// --- CLI ---
export { PluginCLI } from './cli.js';

export {
  TemplateGallery,
  TemplateCustomizer,
  TemplateForkManager,
  TemplateReviewSystem,
} from './templates/index.js';
export type {
  AgentTemplate,
  TemplateAuthor,
  TemplateCategory,
  AgentConfig,
  TemplateTool,
  CustomizationOption,
  TemplateStats,
  TemplateFork,
  TemplateDiff,
  TemplateReview,
  GallerySearchFilters,
  GallerySearchResult,
  CustomizationValues,
  ValidationError,
  CustomizationResult,
} from './templates/index.js';

export { PluginUpdater, PluginDiffer, RollbackManager } from './updater/index.js';
export type {
  UpdateCheckResult,
  UpdateStatus,
  UpdateJob,
  PluginDiffEntry,
  PluginDiff,
  RollbackRecord,
  UpdateCheckOptions,
  PluginSnapshot,
  UpdateNotification,
  UpdateListener,
} from './updater/index.js';

export { SkillToNpmConverter, ReadmeGenerator, Semver, CicdGenerator } from './pipeline/index.js';
export type {
  SemverVersion,
  BumpKind,
  PipelineStatus,
  PipelineStep,
  PipelineRun,
  ConvertOptions,
  ConvertResult,
  ConvertedFile,
  NpmPackageJson,
  ReadmeOptions,
  ReadmeResult,
  ChangelogEntry,
  CicdResult,
} from './pipeline/index.js';

export { PaymentGateway, RevenueSplitter, PayoutScheduler, TaxReporter } from './revenue/index.js';
export type {
  PaymentProvider,
  PaymentStatus,
  Currency,
  PaymentIntent,
  RevenueSplit,
  SplitConfig,
  Payout,
  PayoutSchedule,
  TaxReport,
} from './revenue/index.js';

export {
  DownloadTracker,
  EngagementTracker,
  ErrorAnalytics,
  BenchmarkStore,
} from './analytics/index.js';
export type {
  DownloadStats,
  TimeRange,
  EngagementEvent,
  PluginError,
  BenchmarkResult,
  TrendingScore,
} from './analytics/index.js';

export { ForumManager, BugReportTracker, FeatureVoting, Leaderboard } from './community/index.js';
export type {
  ForumThread,
  ForumReply,
  BugReport,
  FeatureRequest,
  Contributor,
} from './community/index.js';

export * from './plugins/index.js';
