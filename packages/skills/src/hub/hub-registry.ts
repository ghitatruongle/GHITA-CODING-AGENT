// =============================================================================
// GHITA CODING AGENT - Phase 12: Hub Registry (Enhanced Skill Hub)
// =============================================================================
// Orchestrates SkillMeta storage, lock.json, SkillGuard, and AuditLog
// into a unified hub registry. Extends the basic SkillHub with:
//   - Content-hash verification
//   - Lock file management
//   - Audit logging
//   - Trust level resolution
//   - Auto-register into tools/registry
// =============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type {
  SkillMeta,
  SkillSource,
  TrustLevel,
  LockEntry,
  HubConfig,
  HubStats,
} from './types.js';
import { DEFAULT_HUB_CONFIG } from './types.js';
import { SkillGuard } from './skill-guard.js';
import { LockManager } from './lock-manager.js';
import { AuditLog } from './audit-log.js';

// --- HubRegistry Class ---

export class HubRegistry {
  private config: HubConfig;
  private skillGuard: SkillGuard;
  private lockManager: LockManager;
  private auditLog: AuditLog;
  private skills: Map<string, SkillMeta>;

  constructor(customConfig?: Partial<HubConfig>) {
    // Resolve config
    const hubPath = customConfig?.hubPath || path.join(homedir(), '.ghita', 'skills-hub');
    this.config = {
      ...DEFAULT_HUB_CONFIG,
      ...customConfig,
      hubPath,
      lockfilePath: customConfig?.lockfilePath || path.join(hubPath, 'lock.json'),
      auditLogPath: customConfig?.auditLogPath || path.join(hubPath, 'audit-log.json'),
    };

    // Initialize subsystems
    this.skillGuard = new SkillGuard(this.config.trustedRepos);
    this.lockManager = new LockManager(this.config.lockfilePath);
    this.auditLog = new AuditLog(this.config.auditLogPath, this.config.maxAuditEntries);
    this.skills = new Map();

    // Ensure directories
    this.ensureDirectories();

    // Load existing skills from disk
    this.loadAll();
  }

  // --- Directory Management ---

  private ensureDirectories(): void {
    const dirs = [
      this.config.hubPath,
      path.dirname(this.config.lockfilePath),
      path.dirname(this.config.auditLogPath),
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // --- Skill CRUD ---

  /**
   * Create a new skill in the hub.
   */
  create(params: {
    id: string;
    name: string;
    description: string;
    category: SkillMeta['category'];
    version?: string;
    source?: SkillSource;
    author?: string;
    repoUrl?: string;
    tags?: string[];
    permissions?: string[];
    dependencies?: string[];
  }): SkillMeta {
    if (this.skills.has(params.id)) {
      throw new Error(`Skill already exists: ${params.id}`);
    }

    const now = Date.now();
    const source = params.source || 'local';
    const trustLevel = this.skillGuard.resolveTrust(source, params.repoUrl);

    const meta: SkillMeta = {
      id: params.id,
      name: params.name,
      description: params.description,
      category: params.category,
      version: params.version || '0.1.0',
      source,
      trustLevel,
      contentHash: '', // Will be computed below
      author: params.author,
      repoUrl: params.repoUrl,
      tags: params.tags || [],
      createdAt: now,
      updatedAt: now,
      enabled: true,
      permissions: params.permissions,
      dependencies: params.dependencies,
    };

    // Compute and set content hash
    meta.contentHash = this.skillGuard.computeHash(meta);

    // Store
    this.skills.set(meta.id, meta);
    this.saveSkill(meta);

    // Lock
    this.lockManager.lock(this.toLockEntry(meta));

    // Audit
    this.auditLog.log({
      action: 'create',
      skillId: meta.id,
      skillVersion: meta.version,
      actor: 'system',
      success: true,
      newHash: meta.contentHash,
    });

    return meta;
  }

  /**
   * Get a skill by ID.
   */
  get(skillId: string): SkillMeta | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Update a skill's metadata.
   */
  update(skillId: string, patches: Partial<Pick<SkillMeta, 'name' | 'description' | 'version' | 'tags' | 'enabled' | 'permissions' | 'dependencies'>>): SkillMeta {
    const existing = this.skills.get(skillId);
    if (!existing) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const previousHash = existing.contentHash;

    const updated: SkillMeta = {
      ...existing,
      ...patches,
      updatedAt: Date.now(),
    };

    // Recompute hash
    updated.contentHash = this.skillGuard.computeHash(updated);

    // Store
    this.skills.set(skillId, updated);
    this.saveSkill(updated);

    // Update lock
    this.lockManager.lock(this.toLockEntry(updated));

    // Audit
    this.auditLog.log({
      action: 'update',
      skillId,
      skillVersion: updated.version,
      actor: 'system',
      success: true,
      previousHash,
      newHash: updated.contentHash,
    });

    return updated;
  }

  /**
   * Delete a skill from the hub.
   */
  delete(skillId: string): boolean {
    const existing = this.skills.get(skillId);
    if (!existing) return false;

    // Remove from disk
    const filePath = this.getSkillPath(skillId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from memory
    this.skills.delete(skillId);

    // Unlock
    this.lockManager.unlock(skillId);

    // Audit
    this.auditLog.log({
      action: 'delete',
      skillId,
      skillVersion: existing.version,
      actor: 'system',
      success: true,
      previousHash: existing.contentHash,
    });

    return true;
  }

  /**
   * List all skills.
   */
  list(): SkillMeta[] {
    return Array.from(this.skills.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * List skills by category.
   */
  listByCategory(category: SkillMeta['category']): SkillMeta[] {
    return this.list().filter(s => s.category === category);
  }

  /**
   * List skills by trust level.
   */
  listByTrust(trustLevel: TrustLevel): SkillMeta[] {
    return this.list().filter(s => s.trustLevel === trustLevel);
  }

  /**
   * Search skills by keyword.
   */
  search(query: string): SkillMeta[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return this.list();

    return this.list().filter(skill => {
      const searchable = `${skill.name} ${skill.description} ${skill.tags.join(' ')}`.toLowerCase();
      return tokens.every(token => searchable.includes(token));
    });
  }

  /**
   * Enable a skill.
   */
  enable(skillId: string): SkillMeta {
    return this.update(skillId, { enabled: true });
  }

  /**
   * Disable a skill.
   */
  disable(skillId: string): SkillMeta {
    return this.update(skillId, { enabled: false });
  }

  /**
   * Trust a skill (upgrade trust level).
   */
  trust(skillId: string): SkillMeta {
    return this.update(skillId, { /* trustLevel handled separately */ } as Partial<SkillMeta>);
  }

  // --- Trust Management ---

  /**
   * Manually set trust level for a skill.
   */
  setTrustLevel(skillId: string, trustLevel: TrustLevel): SkillMeta {
    const existing = this.skills.get(skillId);
    if (!existing) throw new Error(`Skill not found: ${skillId}`);

    const previousHash = existing.contentHash;
    const updated = { ...existing, trustLevel, updatedAt: Date.now() };
    updated.contentHash = this.skillGuard.computeHash(updated);

    this.skills.set(skillId, updated);
    this.saveSkill(updated);

    this.auditLog.log({
      action: trustLevel === 'restricted' ? 'restrict' : 'trust',
      skillId,
      skillVersion: updated.version,
      actor: 'system',
      success: true,
      previousHash,
      newHash: updated.contentHash,
    });

    return updated;
  }

  // --- Verification ---

  /**
   * Verify a skill's content hash.
   */
  verify(skillId: string): { ok: boolean; error?: string } {
    const meta = this.skills.get(skillId);
    if (!meta) return { ok: false, error: `Skill not found: ${skillId}` };

    const computed = this.skillGuard.computeHash(meta);
    const ok = computed === meta.contentHash;

    this.auditLog.log({
      action: 'verify',
      skillId,
      skillVersion: meta.version,
      actor: 'system',
      success: ok,
      details: ok ? 'Hash verified' : `Hash mismatch: expected ${meta.contentHash}, got ${computed}`,
    });

    return { ok, error: ok ? undefined : `Hash mismatch for "${skillId}"` };
  }

  /**
   * Verify all skills.
   */
  verifyAll(): Array<{ skillId: string; ok: boolean; error?: string }> {
    return this.list().map(s => ({ skillId: s.id, ...this.verify(s.id) }));
  }

  // --- Lock Management ---

  /**
   * Get lock entries for all skills.
   */
  getLockEntries(): LockEntry[] {
    return this.lockManager.listEntries();
  }

  /**
   * Get diff between current state and lock file.
   */
  getLockDiff(): ReturnType<LockManager['diff']> {
    const currentEntries = this.list().map(s => this.toLockEntry(s));
    return this.lockManager.diff(currentEntries);
  }

  // --- Audit ---

  /**
   * Get audit log instance for direct queries.
   */
  getAuditLog(): AuditLog {
    return this.auditLog;
  }

  // --- Stats ---

  /**
   * Get hub statistics.
   */
  stats(): HubStats {
    const skills = this.list();
    const byTrustLevel: Record<TrustLevel, number> = { trusted: 0, verified: 0, unverified: 0, restricted: 0 };
    const bySource: Record<SkillSource, number> = { local: 0, hub: 0, npm: 0, git: 0, imported: 0 };
    const byCategory: Record<SkillMeta['category'], number> = {
      file: 0, terminal: 0, browser: 0, computer: 0, screenshot: 0, app: 0,
    };

    let enabled = 0;
    for (const skill of skills) {
      byTrustLevel[skill.trustLevel]++;
      bySource[skill.source]++;
      byCategory[skill.category]++;
      if (skill.enabled) enabled++;
    }

    return {
      totalSkills: skills.length,
      enabled,
      disabled: skills.length - enabled,
      byTrustLevel,
      bySource,
      byCategory,
      lockfileExists: fs.existsSync(this.config.lockfilePath),
      lastAuditEntry: this.auditLog.getRecent(1)[0],
    };
  }

  // --- Persistence ---

  /**
   * Save a single skill to disk as JSON.
   */
  private saveSkill(meta: SkillMeta): void {
    const filePath = this.getSkillPath(meta.id);
    fs.writeFileSync(filePath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  /**
   * Load all skills from disk.
   */
  private loadAll(): void {
    if (!fs.existsSync(this.config.hubPath)) return;

    const files = fs.readdirSync(this.config.hubPath);
    for (const file of files) {
      if (file.endsWith('.json') && file !== 'lock.json' && file !== 'audit-log.json') {
        const filePath = path.join(this.config.hubPath, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const meta = JSON.parse(raw) as SkillMeta;

          // Optionally verify hash on load
          if (this.config.autoVerify) {
            const computed = this.skillGuard.computeHash(meta);
            if (computed !== meta.contentHash) {
              console.warn(`[HubRegistry] Hash mismatch for "${meta.id}", updating hash`);
              meta.contentHash = computed;
            }
          }

          this.skills.set(meta.id, meta);
        } catch (err) {
          console.error(`[HubRegistry] Failed to load skill from ${file}:`, err);
        }
      }
    }
  }

  /**
   * Get file path for a skill.
   */
  private getSkillPath(skillId: string): string {
    const safeId = skillId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.config.hubPath, `${safeId}.json`);
  }

  /**
   * Convert SkillMeta to LockEntry.
   */
  private toLockEntry(meta: SkillMeta): LockEntry {
    return {
      id: meta.id,
      version: meta.version,
      contentHash: meta.contentHash,
      resolvedPath: this.getSkillPath(meta.id),
      integrity: meta.contentHash,
      lockedAt: Date.now(),
      lockedBy: 'system',
      trustLevel: meta.trustLevel,
    };
  }

  // --- Trusted Repos Management ---

  /**
   * Add a trusted repository.
   */
  addTrustedRepo(repo: string): void {
    this.skillGuard.addTrustedRepo(repo);
    this.config.trustedRepos = this.skillGuard.listTrustedRepos();
  }

  /**
   * Remove a trusted repository.
   */
  removeTrustedRepo(repo: string): boolean {
    const removed = this.skillGuard.removeTrustedRepo(repo);
    if (removed) {
      this.config.trustedRepos = this.skillGuard.listTrustedRepos();
    }
    return removed;
  }

  /**
   * List trusted repositories.
   */
  listTrustedRepos(): string[] {
    return this.skillGuard.listTrustedRepos();
  }

  /**
   * Check if a repository is trusted.
   */
  isTrustedRepo(repoUrl: string): boolean {
    return this.skillGuard.isTrusted(repoUrl);
  }
}
