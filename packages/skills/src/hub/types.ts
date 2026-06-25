// =============================================================================
// GHITA CODING AGENT - Phase 12: Skills Hub Types
// =============================================================================
// SkillMeta, TrustLevel, LockEntry, HubConfig, AuditEntry types
// =============================================================================

import type { SkillCategory } from '@ghita/shared';

// --- Trust Levels ---
export type TrustLevel =
  | 'trusted' // Verified source, content-hash matched
  | 'verified' // From known repo, hash verified
  | 'unverified' // Unknown source, needs review
  | 'restricted'; // Explicitly restricted / blocked

// --- Skill Source ---
export type SkillSource =
  | 'local' // Created locally
  | 'hub' // From GHITA Skills Hub
  | 'npm' // From npm package
  | 'git' // From git repository
  | 'imported'; // Imported from file

// --- Skill Meta (extended metadata for Hub) ---
export interface SkillMeta {
  /** Unique skill identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the skill does */
  description: string;
  /** Skill category */
  category: SkillCategory;
  /** Version string (semver) */
  version: string;
  /** Where this skill came from */
  source: SkillSource;
  /** Trust level assigned to this skill */
  trustLevel: TrustLevel;
  /** Content hash (SHA-256) for integrity verification */
  contentHash: string;
  /** Author name or identifier */
  author?: string;
  /** Repository URL if from git */
  repoUrl?: string;
  /** Tags for search and categorization */
  tags: string[];
  /** Creation timestamp (epoch ms) */
  createdAt: number;
  /** Last update timestamp (epoch ms) */
  updatedAt: number;
  /** Whether this skill is currently enabled */
  enabled: boolean;
  /** Optional: required permissions */
  permissions?: string[];
  /** Optional: dependencies on other skill IDs */
  dependencies?: string[];
}

// --- Lock Entry (single skill record in lock.json) ---
export interface LockEntry {
  /** Skill ID */
  id: string;
  /** Locked version */
  version: string;
  /** Content hash at time of lock */
  contentHash: string;
  /** Resolved file path */
  resolvedPath: string;
  /** Integrity hash of the resolved file */
  integrity: string;
  /** When this entry was locked */
  lockedAt: number;
  /** Who locked it (user or system) */
  lockedBy: string;
  /** Trust level at lock time */
  trustLevel: TrustLevel;
}

// --- Lock File (lock.json structure) ---
export interface LockFile {
  /** Lock file version */
  lockfileVersion: 1;
  /** Timestamp when lock file was created/updated */
  createdAt: number;
  /** Timestamp when lock file was last modified */
  updatedAt: number;
  /** Map of skill ID → LockEntry */
  packages: Record<string, LockEntry>;
}

// --- Hub Configuration ---
export interface HubConfig {
  /** Root directory for hub storage */
  hubPath: string;
  /** Path to lock.json */
  lockfilePath: string;
  /** Path to audit log */
  auditLogPath: string;
  /** Trusted repositories (owner/repo format) */
  trustedRepos: string[];
  /** Auto-verify content hash on load */
  autoVerify: boolean;
  /** Max number of audit entries to keep */
  maxAuditEntries: number;
}

// --- Audit Log Entry ---
export interface AuditEntry {
  /** Unique entry ID */
  id: string;
  /** Operation performed */
  action: AuditAction;
  /** Skill ID affected */
  skillId: string;
  /** Skill version at time of action */
  skillVersion: string;
  /** Timestamp */
  timestamp: number;
  /** Who performed the action */
  actor: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Optional details or error message */
  details?: string;
  /** Content hash before change (for updates) */
  previousHash?: string;
  /** Content hash after change */
  newHash?: string;
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'enable'
  | 'disable'
  | 'lock'
  | 'unlock'
  | 'verify'
  | 'trust'
  | 'restrict'
  | 'import'
  | 'export';

// --- Verify Result ---
export interface VerifyResult {
  /** Whether verification passed */
  ok: boolean;
  /** Skill ID that was verified */
  skillId: string;
  /** Expected hash */
  expectedHash: string;
  /** Actual computed hash */
  actualHash: string;
  /** Error message if verification failed */
  error?: string;
  /** Timestamp of verification */
  verifiedAt: number;
}

// --- Hub Stats ---
export interface HubStats {
  totalSkills: number;
  enabled: number;
  disabled: number;
  byTrustLevel: Record<TrustLevel, number>;
  bySource: Record<SkillSource, number>;
  byCategory: Record<SkillCategory, number>;
  lockfileExists: boolean;
  lastAuditEntry?: AuditEntry;
}

// --- Default Hub Config ---
export const DEFAULT_HUB_CONFIG: HubConfig = {
  hubPath: '', // Will be resolved to ~/.ghita/skills-hub
  lockfilePath: '', // Will be resolved to hubPath/lock.json
  auditLogPath: '', // Will be resolved to hubPath/audit-log.json
  trustedRepos: ['ghita-corp/ghita-skills', 'ghita-corp/official-skills'],
  autoVerify: true,
  maxAuditEntries: 1000,
};
