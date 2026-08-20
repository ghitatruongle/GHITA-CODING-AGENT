// ==============================================================================
// GHITA CODING AGENT - Skills v1.1.0 Track 2: v2 public entry
// ==============================================================================

export {
  validateSkillV2,
  parseV2Manifest,
  parseAllowedTools,
  validateSkillFolder,
  applyV2Fields,
} from './validator.js';
export type { SkillV2Manifest, SkillV2Validation, ValidationIssue } from './validator.js';
export { VALID_ALLOWED_TOOLS, VALID_SANDBOX_LEVELS } from './validator.js';

export { importSkillV2, importSkillV2Batch } from './importer.js';
export type { V2ImportSource, V2ImportResult } from './importer.js';

export { createToolGate, runSkillWithToolGate } from './enforce.js';
export type { DeniedTool, ToolGateStats } from './enforce.js';

export { classifyLicense, generateThirdPartyNotices, LICENSE_MATRIX } from './licenses.js';
export type { LicenseClass, LicenseInfo, NoticeEntry } from './licenses.js';

export {
  computeFolderHash,
  parseSkillLockV3,
  serializeSkillLockV3,
  upsertLockEntry,
  detectLockChanges,
} from './skill-lock.js';
export type {
  SkillLockV3Entry,
  SkillLockV3File,
  LockSourceType,
  LockProvider,
} from './skill-lock.js';

export {
  discoverSkills,
  findSkillMarkdowns,
  parseDiscoveredSkill,
  discoveredToSkill,
} from './discover.js';
export type { DiscoverOptions, DiscoveredSkill, SkillLayer } from './discover.js';

export { evaluateDraft, improveDescription, runCreatorLoop } from './creator-loop.js';
export type { SkillDraft, PromptEval, DraftEvaluation, EvalConfig } from './creator-loop.js';

export { InstinctTriggerMetrics } from './instinct-metrics.js';
export type { TriggerEvent, TriggerStats } from './instinct-metrics.js';

export {
  planExport,
  skillToMarkdown,
  exportPlanSummary,
  HARNESS_TARGETS,
} from './export-harness.js';
export type {
  ExportHarness,
  ExportPlan,
  ExportedSkillFile,
  HarnessTarget,
} from './export-harness.js';

export { SkillSandboxRunner, dockerAvailable } from './sandbox.js';
export type {
  SandboxConfig,
  SandboxRunOptions,
  SandboxRunResult,
  SandboxExecutor,
} from './sandbox.js';

export { toSkillListView } from './view.js';
export type { SkillViewRow, LockLookup } from './view.js';

// ── v1.1.5-beta1 Track 7: Skills & Marketplace v3 ──
export {
  ENGINEERING_SKILL_CHAIN,
  DEFAULT_SKILL_PACK_CONFIG,
  checkGateSatisfied,
  getNextPhase,
  renderPhasePrompt,
  loadContextMd,
  createSkillPackSession,
  advanceSession,
} from '../engineering/skill-pack.js';
export type {
  SkillPackPhase,
  SkillPackStep,
  SkillPackConfig,
  SkillPackSession,
} from '../engineering/skill-pack.js';
export {
  SkillUsageTracker,
  lintSkillContent,
  createQuarantinedSkill,
  promoteFromQuarantine,
} from './self-improve.js';
export type {
  SkillUsageRecord,
  SkillUsageStats,
  SkillTier,
  QuarantinedSkill,
  LintIssue,
} from './self-improve.js';
export {
  scoreDescription,
  suggestImprovements,
  runDescriptionBenchmark,
} from './description-optimizer.js';
export type { DescriptionCandidate, BenchmarkResult } from './description-optimizer.js';
export {
  renderSkillForUse,
  detectTreeShaChange,
  normalizePluginManifest,
  validateMarketplaceManifest,
  lintSkillSubmission,
  ScanCache,
  runCapabilityDoctor,
} from './capability-doctor.js';
export type {
  SkillUseResult,
  PluginManifest,
  MarketplaceManifest,
  SkillLintResult,
  CapabilityStatus,
  CapabilityCheck,
  CapabilityReport,
} from './capability-doctor.js';
