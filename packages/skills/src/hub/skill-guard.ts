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
 * Compute hash from SkillMeta fields plus optional script content.
 *
 * SECURITY (audit fix 2.17): the previous implementation only hashed
 * the metadata fields (`id`, `name`, `description`, …), which means an
 * attacker who can edit the skill's script files could swap executable
 * content while leaving the metadata intact — the hash would still match.
 *
 * Callers SHOULD pass `contentPaths` listing the on-disk files that
 * make up the skill (e.g. `index.js`, `manifest.yaml`, `commands/*.ts`).
 * The function reads each path, hashes its UTF-8 contents, and combines
 * them with the metadata hash via a SHA-256 of all digests concatenated.
 *
 * Files that do not exist are skipped with a console.warn — this lets
 * the call site decide whether to fail closed. Production installers
 * should treat warnings as integrity failures.
 */
export function computeSkillHash(meta: SkillMeta, contentPaths?: string[]): string {
  const payload = JSON.stringify(
    {
      id: meta.id,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      version: meta.version,
      source: meta.source,
      tags: [...meta.tags].sort(),
      permissions: meta.permissions ? [...meta.permissions].sort() : [],
      dependencies: meta.dependencies ? [...meta.dependencies].sort() : [],
    },
    null,
    0,
  );
  const metaHash = computeContentHash(payload);

  if (!contentPaths || contentPaths.length === 0) {
    // Backwards-compatible behaviour: callers that haven't been updated
    // to pass content paths still get a metadata-only hash. We emit a
    // warning so the gap is visible at install time.

    console.warn(
      `[SkillGuard] computeSkillHash(${meta.id}) called without contentPaths — ` +
        'integrity check is metadata-only and can be bypassed by editing script files.',
    );
    return metaHash;
  }

  const fileHashes: string[] = [];
  for (const p of contentPaths) {
    try {
      const content = fs.readFileSync(p, 'utf8');
      fileHashes.push(`${p}:${computeContentHash(content)}`);
    } catch (err) {
      console.warn(
        `[SkillGuard] failed to hash file ${p} for skill ${meta.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return computeContentHash(`${metaHash}\n${fileHashes.sort().join('\n')}`);
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
    if (trustedRepos.some((tr) => normalizeRepoUrl(tr) === normalized)) {
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
 * SECURITY (audit fix 2.17): forwards contentPaths to computeSkillHash
 * so script files are included in the integrity check, not just metadata.
 */
export function verifySkillHash(
  meta: SkillMeta,
  expectedHash: string,
  contentPaths?: string[],
): VerifyResult {
  const actualHash = computeSkillHash(meta, contentPaths);
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
export function verifyFileHash(filePath: string, expectedHash: string): VerifyResult {
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
 * SECURITY (audit fix 2.17): forwards contentPaths to computeSkillHash
 * so script files are included in the integrity check, not just metadata.
 */
export function checkIntegrity(
  meta: SkillMeta,
  trustedRepos: string[] = DEFAULT_TRUSTED_REPOS,
  contentPaths?: string[],
): IntegrityReport {
  const issues: string[] = [];

  // Check hash consistency
  const computedHash = computeSkillHash(meta, contentPaths);
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
    return this.trustedRepos.some((tr) => normalizeRepoUrl(tr) === normalized);
  }

  /** Compute content hash for a skill (SECURITY audit fix 2.17: forwards contentPaths) */
  computeHash(meta: SkillMeta, contentPaths?: string[]): string {
    return computeSkillHash(meta, contentPaths);
  }

  /** Verify a skill's integrity (SECURITY audit fix 2.17: forwards contentPaths) */
  verify(meta: SkillMeta, expectedHash: string, contentPaths?: string[]): VerifyResult {
    return verifySkillHash(meta, expectedHash, contentPaths);
  }

  /** Full integrity check (SECURITY audit fix 2.17: forwards contentPaths) */
  checkIntegrity(meta: SkillMeta, contentPaths?: string[]): IntegrityReport {
    return checkIntegrity(meta, this.trustedRepos, contentPaths);
  }

  /** Resolve trust level for a skill */
  resolveTrust(source: SkillMeta['source'], repoUrl?: string): TrustLevel {
    return resolveTrustLevel(source, repoUrl, this.trustedRepos);
  }
}
