// Re-exports all public types, classes, and functions from the hub module.

// --- Types ---
export type {
  SkillMeta,
  SkillSource,
  TrustLevel,
  LockEntry,
  LockFile,
  HubConfig,
  HubStats,
  AuditEntry,
  AuditAction,
  VerifyResult,
} from './types.js';

export { DEFAULT_HUB_CONFIG } from './types.js';

// --- SkillGuard ---
export {
  SkillGuard,
  computeContentHash,
  computeFileHash,
  computeSkillHash,
  resolveTrustLevel,
  normalizeRepoUrl,
  verifySkillHash,
  verifyFileHash,
  checkIntegrity,
  DEFAULT_TRUSTED_REPOS,
} from './skill-guard.js';

export type { IntegrityReport } from './skill-guard.js';

// --- LockManager ---
export { LockManager } from './lock-manager.js';

// --- AuditLog ---
export { AuditLog } from './audit-log.js';

// --- HubRegistry ---
export { HubRegistry } from './hub-registry.js';

// --- Skills Commands ---
export { createSkillsCommands } from './skills-commands.js';
