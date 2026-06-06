// =============================================================================
// GHITA CODING AGENT - Phase 12: SkillGuard (Content Hash + Trusted Repos)
// =============================================================================
// Verifies skill integrity via SHA-256 content hashes and checks
// whether skills originate from trusted repositories.
// =============================================================================

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillMeta, TrustLevel, VerifyResult } from './types.js';

// --- Default Trusted Repositories ---
export const DEFAULT_TRUSTED_REPOS: string[] = [
  'ghita-corp/ghita-skills',
  'ghita-corp/official-skills',
];

// --- Content Hash Computation ---

/**
 * Compute SHA-256 hash of a string content.
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Compute SHA-256 hash of a file.
 */
export function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  return computeContentHash(content);
}

/**
 * Compute hash from SkillMeta fields (deterministic).
 * Sorts keys to ensure consistent hashing.
 */
export function computeSkillHash(meta: SkillMeta): string {
  const payload = JSON.stringify({
    id: meta.id,
    name: meta.name,
    description: meta.description,
    category: meta.category,
    version: meta.version,
    source: meta.source,
    tags: [...meta.tags].sort(),
    permissions: meta.permissions ? [...meta.permissions].sort() : [],
    dependencies: meta.dependencies ? [...meta.dependencies].sort() : [],
  }, null, 0);
  return computeContentHash(payload);
}

// --- Trust Level Resolution ---

/**
 * Resolve trust level based on source and repo URL.
 */
export function resolveTrustLevel(
  source: SkillMeta['source'],
  repoUrl?: string,
  trustedRepos: string[] = DEFAULT_TRUSTED_REPOS,
): TrustLevel {
  // Local skills are trusted by default
  if (source === 'local') return 'trusted';

  // Imported skills are unverified by default
  if (source === 'imported') return 'unverified';

  // Hub skills from verified sources
  if (source === 'hub') return 'verified';

  // Git skills: check if repo is in trusted list
  if (source === 'git' && repoUrl) {
    const normalized = normalizeRepoUrl(repoUrl);
    if (trustedRepos.some(tr => normalizeRepoUrl(tr) === normalized)) {
      return 'trusted';
    }
    return 'verified'; // Known git source but not in trusted list
  }

  // npm skills
  if (source === 'npm') return 'verified';

  return 'unverified';
}

/**
 * Normalize a repo URL or owner/repo string to a consistent format.
 * Accepts: "owner/repo", "https://github.com/owner/repo", "git@github.com:owner/repo.git"
 * Returns: "owner/repo"
 */
export function normalizeRepoUrl(url: string): string {
  // Already in owner/repo format
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(url)) {
    return url.toLowerCase();
  }

  // HTTPS URL: https://github.com/owner/repo
  const httpsMatch = url.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (httpsMatch && httpsMatch[1] && httpsMatch[2]) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`.toLowerCase();
  }

  // SSH URL: git@github.com:owner/repo.git
  const sshMatch = url.match(/github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (sshMatch && sshMatch[1] && sshMatch[2]) {
    return `${sshMatch[1]}/${sshMatch[2]}`.toLowerCase().replace(/\.git$/, '');
  }

  // Fallback: return as-is, lowercased
  return url.toLowerCase();
}

// --- Verification ---

/**
 * Verify a skill's content hash matches expected hash.
 */
export function verifySkillHash(
  meta: SkillMeta,
  expectedHash: string,
): VerifyResult {
  const actualHash = computeSkillHash(meta);
  const ok = actualHash === expectedHash;

  return {
    ok,
    skillId: meta.id,
    expectedHash,
    actualHash,
    verifiedAt: Date.now(),
    error: ok ? undefined : `Hash mismatch: expected ${expectedHash}, got ${actualHash}`,
  };
}

/**
 * Verify a file's hash matches expected hash.
 */
export function verifyFileHash(
  filePath: string,
  expectedHash: string,
): VerifyResult {
  const actualHash = computeFileHash(filePath);
  const ok = actualHash === expectedHash;

  return {
    ok,
    skillId: path.basename(filePath, path.extname(filePath)),
    expectedHash,
    actualHash,
    verifiedAt: Date.now(),
    error: ok ? undefined : `File hash mismatch for ${filePath}`,
  };
}

// --- Integrity Check ---

export interface IntegrityReport {
  skillId: string;
  hashValid: boolean;
  trustLevel: TrustLevel;
  source: string;
  repoUrl?: string;
  issues: string[];
}

/**
 * Full integrity check for a SkillMeta entry.
 */
export function checkIntegrity(
  meta: SkillMeta,
  trustedRepos: string[] = DEFAULT_TRUSTED_REPOS,
): IntegrityReport {
  const issues: string[] = [];

  // Check hash consistency
  const computedHash = computeSkillHash(meta);
  const hashValid = computedHash === meta.contentHash;
  if (!hashValid) {
    issues.push(`Content hash mismatch: stored=${meta.contentHash}, computed=${computedHash}`);
  }

  // Check trust level consistency
  const expectedTrust = resolveTrustLevel(meta.source, meta.repoUrl, trustedRepos);
  if (meta.trustLevel !== expectedTrust) {
    issues.push(`Trust level mismatch: stored=${meta.trustLevel}, expected=${expectedTrust}`);
  }

  // Check required fields
  if (!meta.id) issues.push('Missing skill ID');
  if (!meta.name) issues.push('Missing skill name');
  if (!meta.version) issues.push('Missing version');
  if (meta.tags.length === 0) issues.push('No tags defined');

  return {
    skillId: meta.id,
    hashValid,
    trustLevel: meta.trustLevel,
    source: meta.source,
    repoUrl: meta.repoUrl,
    issues,
  };
}

// --- SkillGuard Class ---

export class SkillGuard {
  private trustedRepos: string[];

  constructor(trustedRepos: string[] = DEFAULT_TRUSTED_REPOS) {
    this.trustedRepos = [...trustedRepos];
  }

  /** Add a trusted repo (owner/repo format) */
  addTrustedRepo(repo: string): void {
    const normalized = normalizeRepoUrl(repo);
    if (!this.trustedRepos.includes(normalized)) {
      this.trustedRepos.push(normalized);
    }
  }

  /** Remove a trusted repo */
  removeTrustedRepo(repo: string): boolean {
    const normalized = normalizeRepoUrl(repo);
    const idx = this.trustedRepos.indexOf(normalized);
    if (idx >= 0) {
      this.trustedRepos.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** List all trusted repos */
  listTrustedRepos(): string[] {
    return [...this.trustedRepos];
  }

  /** Check if a repo is trusted */
  isTrusted(repoUrl: string): boolean {
    const normalized = normalizeRepoUrl(repoUrl);
    return this.trustedRepos.some(tr => normalizeRepoUrl(tr) === normalized);
  }

  /** Compute content hash for a skill */
  computeHash(meta: SkillMeta): string {
    return computeSkillHash(meta);
  }

  /** Verify a skill's integrity */
  verify(meta: SkillMeta, expectedHash: string): VerifyResult {
    return verifySkillHash(meta, expectedHash);
  }

  /** Full integrity check */
  checkIntegrity(meta: SkillMeta): IntegrityReport {
    return checkIntegrity(meta, this.trustedRepos);
  }

  /** Resolve trust level for a skill */
  resolveTrust(source: SkillMeta['source'], repoUrl?: string): TrustLevel {
    return resolveTrustLevel(source, repoUrl, this.trustedRepos);
  }
}
