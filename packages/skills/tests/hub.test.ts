import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  SkillGuard,
  computeContentHash,
  computeSkillHash,
  normalizeRepoUrl,
  resolveTrustLevel,
  DEFAULT_TRUSTED_REPOS,
} from '../src/hub/skill-guard.js';
import { LockManager } from '../src/hub/lock-manager.js';
import { AuditLog } from '../src/hub/audit-log.js';
import { HubRegistry } from '../src/hub/hub-registry.js';
import { createSkillsCommands } from '../src/hub/skills-commands.js';
import type { SkillMeta, LockEntry } from '../src/hub/types.js';

// --- Test Helpers ---
let tmpDir: string;

function makeTmpDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghita-hub-test-'));
  return tmpDir;
}

function cleanTmpDir(): void {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function makeSkillMeta(overrides?: Partial<SkillMeta>): SkillMeta {
  const base: SkillMeta = {
    id: 'test-skill',
    name: 'Test Skill',
    description: 'A test skill',
    category: 'terminal',
    version: '1.0.0',
    source: 'local',
    trustLevel: 'trusted',
    contentHash: '',
    tags: ['test'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    enabled: true,
  };
  const meta = { ...base, ...overrides };
  meta.contentHash = computeSkillHash(meta);
  return meta;
}

// =============================================================================
// SkillGuard Tests
// =============================================================================
describe('SkillGuard', () => {
  beforeEach(() => makeTmpDir());
  afterEach(() => cleanTmpDir());

  describe('computeContentHash', () => {
    it('should produce consistent SHA-256 hashes', () => {
      const hash1 = computeContentHash('hello world');
      const hash2 = computeContentHash('hello world');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should differ for different inputs', () => {
      const h1 = computeContentHash('foo');
      const h2 = computeContentHash('bar');
      expect(h1).not.toBe(h2);
    });
  });

  describe('computeSkillHash', () => {
    it('should hash SkillMeta deterministically', () => {
      const meta = makeSkillMeta();
      const h1 = computeSkillHash(meta);
      const h2 = computeSkillHash(meta);
      expect(h1).toBe(h2);
    });

    it('should produce 64-char hex string', () => {
      const meta = makeSkillMeta();
      const hash = computeSkillHash(meta);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should differ when content changes', () => {
      const meta1 = makeSkillMeta({ name: 'Skill A' });
      const meta2 = makeSkillMeta({ name: 'Skill B' });
      expect(computeSkillHash(meta1)).not.toBe(computeSkillHash(meta2));
    });
  });

  describe('normalizeRepoUrl', () => {
    it('should normalize owner/repo format', () => {
      expect(normalizeRepoUrl('ghita-corp/ghita-skills')).toBe('ghita-corp/ghita-skills');
    });

    it('should normalize HTTPS URL', () => {
      expect(normalizeRepoUrl('https://github.com/ghita-corp/ghita-skills')).toBe(
        'ghita-corp/ghita-skills',
      );
    });

    it('should normalize SSH URL', () => {
      expect(normalizeRepoUrl('git@github.com:ghita-corp/ghita-skills.git')).toBe(
        'ghita-corp/ghita-skills',
      );
    });

    it('should lowercase results', () => {
      expect(normalizeRepoUrl('Ghita-Corp/Ghita-Skills')).toBe('ghita-corp/ghita-skills');
    });
  });

  describe('resolveTrustLevel', () => {
    it('local source → trusted', () => {
      expect(resolveTrustLevel('local')).toBe('trusted');
    });

    it('imported source → unverified', () => {
      expect(resolveTrustLevel('imported')).toBe('unverified');
    });

    it('hub source → verified', () => {
      expect(resolveTrustLevel('hub')).toBe('verified');
    });

    it('git from trusted repo → trusted', () => {
      expect(resolveTrustLevel('git', 'https://github.com/ghita-corp/ghita-skills')).toBe(
        'trusted',
      );
    });

    it('git from untrusted repo → verified', () => {
      expect(resolveTrustLevel('git', 'https://github.com/random/dev')).toBe('verified');
    });

    it('npm source → verified', () => {
      expect(resolveTrustLevel('npm')).toBe('verified');
    });

    it('unknown source → unverified', () => {
      expect(resolveTrustLevel('unknown' as any)).toBe('unverified');
    });
  });

  describe('SkillGuard class', () => {
    it('should list default trusted repos', () => {
      const guard = new SkillGuard();
      expect(guard.listTrustedRepos()).toEqual(DEFAULT_TRUSTED_REPOS);
    });

    it('should add/remove trusted repos', () => {
      const guard = new SkillGuard();
      guard.addTrustedRepo('test/repo');
      expect(guard.listTrustedRepos()).toContain('test/repo');

      const removed = guard.removeTrustedRepo('test/repo');
      expect(removed).toBe(true);
      expect(guard.listTrustedRepos()).not.toContain('test/repo');
    });

    it('should report isTrusted correctly', () => {
      const guard = new SkillGuard();
      expect(guard.isTrusted('ghita-corp/ghita-skills')).toBe(true);
      expect(guard.isTrusted('https://github.com/ghita-corp/ghita-skills')).toBe(true);
      expect(guard.isTrusted('random/dev')).toBe(false);
    });

    it('should compute hash and verify', () => {
      const guard = new SkillGuard();
      const meta = makeSkillMeta();
      const hash = guard.computeHash(meta);
      const result = guard.verify(meta, hash);
      expect(result.ok).toBe(true);
    });

    it('should fail verify on wrong hash', () => {
      const guard = new SkillGuard();
      const meta = makeSkillMeta();
      const result = guard.verify(meta, 'wrong-hash');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Hash mismatch');
    });

    it('should run full integrity check', () => {
      const guard = new SkillGuard();
      const meta = makeSkillMeta();
      const report = guard.checkIntegrity(meta);
      expect(report.hashValid).toBe(true);
      expect(report.issues).toHaveLength(0);
    });

    it('should detect hash mismatch in integrity check', () => {
      const guard = new SkillGuard();
      const meta = makeSkillMeta();
      meta.contentHash = 'bad-hash';
      const report = guard.checkIntegrity(meta);
      expect(report.hashValid).toBe(false);
      expect(report.issues.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// LockManager Tests
// =============================================================================
describe('LockManager', () => {
  beforeEach(() => makeTmpDir());
  afterEach(() => cleanTmpDir());

  it('should create new lock file if missing', () => {
    const lockPath = path.join(tmpDir, 'lock.json');
    const lm = new LockManager(lockPath);
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(lm.size).toBe(0);
  });

  it('should lock and unlock entries', () => {
    const lm = new LockManager(path.join(tmpDir, 'lock.json'));

    const entry: LockEntry = {
      id: 'skill-a',
      version: '1.0.0',
      contentHash: 'abc123',
      resolvedPath: '/skills/skill-a.json',
      integrity: 'abc123',
      lockedAt: Date.now(),
      lockedBy: 'system',
      trustLevel: 'trusted',
    };

    lm.lock(entry);
    expect(lm.isLocked('skill-a')).toBe(true);
    expect(lm.size).toBe(1);

    const unlocked = lm.unlock('skill-a');
    expect(unlocked).toBe(true);
    expect(lm.isLocked('skill-a')).toBe(false);
    expect(lm.size).toBe(0);
  });

  it('should persist across instances', () => {
    const lockPath = path.join(tmpDir, 'lock.json');

    const lm1 = new LockManager(lockPath);
    lm1.lock({
      id: 'x',
      version: '1.0.0',
      contentHash: 'h',
      resolvedPath: '/x',
      integrity: 'h',
      lockedAt: 0,
      lockedBy: 'test',
      trustLevel: 'verified',
    });

    const lm2 = new LockManager(lockPath);
    expect(lm2.isLocked('x')).toBe(true);
    expect(lm2.size).toBe(1);
  });

  it('should batch lock entries', () => {
    const lm = new LockManager(path.join(tmpDir, 'lock.json'));
    const entries: LockEntry[] = [
      {
        id: 'a',
        version: '1.0.0',
        contentHash: 'ha',
        resolvedPath: '/a',
        integrity: 'ha',
        lockedAt: 0,
        lockedBy: 'test',
        trustLevel: 'trusted',
      },
      {
        id: 'b',
        version: '2.0.0',
        contentHash: 'hb',
        resolvedPath: '/b',
        integrity: 'hb',
        lockedAt: 0,
        lockedBy: 'test',
        trustLevel: 'verified',
      },
    ];

    lm.lockBatch(entries);
    expect(lm.size).toBe(2);
    expect(lm.listIds()).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('should compute diff correctly', () => {
    const lm = new LockManager(path.join(tmpDir, 'lock.json'));
    lm.lock({
      id: 'a',
      version: '1.0.0',
      contentHash: 'h1',
      resolvedPath: '/a',
      integrity: 'h1',
      lockedAt: 0,
      lockedBy: 'test',
      trustLevel: 'trusted',
    });
    lm.lock({
      id: 'b',
      version: '1.0.0',
      contentHash: 'h2',
      resolvedPath: '/b',
      integrity: 'h2',
      lockedAt: 0,
      lockedBy: 'test',
      trustLevel: 'trusted',
    });

    const newEntries: LockEntry[] = [
      {
        id: 'a',
        version: '1.0.0',
        contentHash: 'h1',
        resolvedPath: '/a',
        integrity: 'h1',
        lockedAt: 0,
        lockedBy: 'test',
        trustLevel: 'trusted',
      },
      {
        id: 'c',
        version: '1.0.0',
        contentHash: 'h3',
        resolvedPath: '/c',
        integrity: 'h3',
        lockedAt: 0,
        lockedBy: 'test',
        trustLevel: 'verified',
      },
    ];

    const diff = lm.diff(newEntries);
    expect(diff.added.map((e) => e.id)).toEqual(['c']);
    expect(diff.removed).toEqual(['b']);
    expect(diff.unchanged).toEqual(['a']);
    expect(diff.updated).toHaveLength(0);
  });

  it('should detect version update in diff', () => {
    const lm = new LockManager(path.join(tmpDir, 'lock.json'));
    lm.lock({
      id: 'a',
      version: '1.0.0',
      contentHash: 'h1',
      resolvedPath: '/a',
      integrity: 'h1',
      lockedAt: 0,
      lockedBy: 'test',
      trustLevel: 'trusted',
    });

    const newEntries: LockEntry[] = [
      {
        id: 'a',
        version: '2.0.0',
        contentHash: 'h2',
        resolvedPath: '/a',
        integrity: 'h2',
        lockedAt: 0,
        lockedBy: 'test',
        trustLevel: 'trusted',
      },
    ];

    const diff = lm.diff(newEntries);
    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0].version).toBe('2.0.0');
  });

  it('should clear all entries', () => {
    const lm = new LockManager(path.join(tmpDir, 'lock.json'));
    lm.lockBatch([
      {
        id: 'a',
        version: '1.0.0',
        contentHash: 'h',
        resolvedPath: '/a',
        integrity: 'h',
        lockedAt: 0,
        lockedBy: 'test',
        trustLevel: 'trusted',
      },
      {
        id: 'b',
        version: '1.0.0',
        contentHash: 'h',
        resolvedPath: '/b',
        integrity: 'h',
        lockedAt: 0,
        lockedBy: 'test',
        trustLevel: 'trusted',
      },
    ]);
    expect(lm.size).toBe(2);

    lm.clear();
    expect(lm.size).toBe(0);
  });
});

// =============================================================================
// AuditLog Tests
// =============================================================================
describe('AuditLog', () => {
  beforeEach(() => makeTmpDir());
  afterEach(() => cleanTmpDir());

  it('should create and query entries', () => {
    const log = new AuditLog(path.join(tmpDir, 'audit.json'));

    log.log({
      action: 'create',
      skillId: 's1',
      skillVersion: '1.0.0',
      actor: 'alice',
      success: true,
    });
    log.log({
      action: 'delete',
      skillId: 's2',
      skillVersion: '0.5.0',
      actor: 'bob',
      success: true,
    });

    expect(log.getAll()).toHaveLength(2);
    expect(log.getBySkill('s1')).toHaveLength(1);
    expect(log.getByAction('delete')).toHaveLength(1);
    expect(log.getByActor('alice')).toHaveLength(1);
  });

  it('should persist across instances', () => {
    const logPath = path.join(tmpDir, 'audit.json');
    const log1 = new AuditLog(logPath);
    log1.log({
      action: 'create',
      skillId: 's1',
      skillVersion: '1.0.0',
      actor: 'test',
      success: true,
    });

    const log2 = new AuditLog(logPath);
    expect(log2.getAll()).toHaveLength(1);
  });

  it('should track failures', () => {
    const log = new AuditLog(path.join(tmpDir, 'audit.json'));
    log.log({
      action: 'verify',
      skillId: 's1',
      skillVersion: '1.0.0',
      actor: 'test',
      success: true,
    });
    log.log({
      action: 'verify',
      skillId: 's2',
      skillVersion: '1.0.0',
      actor: 'test',
      success: false,
      details: 'Hash mismatch',
    });

    const failures = log.getFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0].skillId).toBe('s2');
  });

  it('should compute stats', () => {
    const log = new AuditLog(path.join(tmpDir, 'audit.json'));
    log.log({
      action: 'create',
      skillId: 's1',
      skillVersion: '1.0.0',
      actor: 'test',
      success: true,
    });
    log.log({
      action: 'delete',
      skillId: 's1',
      skillVersion: '1.0.0',
      actor: 'test',
      success: true,
    });

    const stats = log.stats();
    expect(stats.total).toBe(2);
    expect(stats.byAction.create).toBe(1);
    expect(stats.byAction.delete).toBe(1);
    expect(stats.successRate).toBe(1);
  });

  it('should trim old entries', () => {
    const log = new AuditLog(path.join(tmpDir, 'audit.json'), 100);
    log.log({
      action: 'create',
      skillId: 's1',
      skillVersion: '1.0.0',
      actor: 'test',
      success: true,
      timestamp: Date.now(),
    } as any);

    const oldTime = Date.now() - 86400000;
    log.log({
      action: 'delete',
      skillId: 's2',
      skillVersion: '1.0.0',
      actor: 'test',
      success: true,
      timestamp: oldTime,
    } as any);

    const removed = log.trim(Date.now() - 43200000); // 12 hours ago
    expect(removed).toBe(1);
    expect(log.getAll()).toHaveLength(1);
  });

  it('should return recent entries', () => {
    const log = new AuditLog(path.join(tmpDir, 'audit.json'));
    for (let i = 0; i < 20; i++) {
      log.log({
        action: 'create',
        skillId: `s${i}`,
        skillVersion: '1.0.0',
        actor: 'test',
        success: true,
      });
    }
    const recent = log.getRecent(5);
    expect(recent).toHaveLength(5);
    expect(recent[4].skillId).toBe('s19');
  });
});

// =============================================================================
// HubRegistry Tests (Integration)
// =============================================================================
describe('HubRegistry', () => {
  beforeEach(() => makeTmpDir());
  afterEach(() => cleanTmpDir());

  function createHub(): HubRegistry {
    return new HubRegistry({
      hubPath: path.join(tmpDir, 'hub'),
      lockfilePath: path.join(tmpDir, 'hub', 'lock.json'),
      auditLogPath: path.join(tmpDir, 'hub', 'audit.json'),
      trustedRepos: [...DEFAULT_TRUSTED_REPOS],
      autoVerify: true,
      maxAuditEntries: 100,
    });
  }

  describe('Skill CRUD', () => {
    it('should create and retrieve a skill', () => {
      const hub = createHub();
      const meta = hub.create({
        id: 'my-skill',
        name: 'My Skill',
        description: 'Test',
        category: 'terminal',
      });

      expect(meta.id).toBe('my-skill');
      expect(meta.name).toBe('My Skill');
      expect(meta.trustLevel).toBe('trusted'); // local → trusted
      expect(meta.contentHash).toHaveLength(64);

      const retrieved = hub.get('my-skill');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('my-skill');
    });

    it('should prevent duplicate creation', () => {
      const hub = createHub();
      hub.create({ id: 'dup', name: 'Dup', description: 'Test', category: 'terminal' });
      expect(() =>
        hub.create({ id: 'dup', name: 'Dup 2', description: 'Test', category: 'terminal' }),
      ).toThrow('already exists');
    });

    it('should update a skill', () => {
      const hub = createHub();
      hub.create({ id: 's1', name: 'Original', description: 'Test', category: 'terminal' });

      const updated = hub.update('s1', { name: 'Updated', version: '2.0.0' });
      expect(updated.name).toBe('Updated');
      expect(updated.version).toBe('2.0.0');

      const fromHub = hub.get('s1');
      expect(fromHub!.name).toBe('Updated');
    });

    it('should delete a skill', () => {
      const hub = createHub();
      hub.create({ id: 'del-me', name: 'Delete Me', description: 'Test', category: 'terminal' });
      expect(hub.get('del-me')).toBeDefined();

      const deleted = hub.delete('del-me');
      expect(deleted).toBe(true);
      expect(hub.get('del-me')).toBeUndefined();
    });

    it('should return false when deleting non-existent skill', () => {
      const hub = createHub();
      expect(hub.delete('nonexistent')).toBe(false);
    });

    it('should list all skills', () => {
      const hub = createHub();
      hub.create({ id: 'a', name: 'Alpha', description: 'Test', category: 'terminal' });
      hub.create({ id: 'b', name: 'Beta', description: 'Test', category: 'browser' });

      const list = hub.list();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('Alpha'); // sorted alphabetically
      expect(list[1].name).toBe('Beta');
    });

    it('should search skills', () => {
      const hub = createHub();
      hub.create({
        id: 'git-skill',
        name: 'Git Helper',
        description: 'Helps with git',
        category: 'terminal',
        tags: ['git'],
      });
      hub.create({
        id: 'docker-skill',
        name: 'Docker Helper',
        description: 'Helps with docker',
        category: 'terminal',
        tags: ['docker'],
      });

      const results = hub.search('git');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('git-skill');
    });

    it('should filter by category', () => {
      const hub = createHub();
      hub.create({ id: 't1', name: 'Terminal 1', description: 'Test', category: 'terminal' });
      hub.create({ id: 'b1', name: 'Browser 1', description: 'Test', category: 'browser' });

      expect(hub.listByCategory('terminal')).toHaveLength(1);
      expect(hub.listByCategory('browser')).toHaveLength(1);
      expect(hub.listByCategory('screenshot')).toHaveLength(0);
    });

    it('should enable/disable skills', () => {
      const hub = createHub();
      hub.create({ id: 'toggle', name: 'Toggle', description: 'Test', category: 'terminal' });
      expect(hub.get('toggle')!.enabled).toBe(true);

      hub.disable('toggle');
      expect(hub.get('toggle')!.enabled).toBe(false);

      hub.enable('toggle');
      expect(hub.get('toggle')!.enabled).toBe(true);
    });
  });

  describe('Lock Integration', () => {
    it('should create lock entries on skill creation', () => {
      const hub = createHub();
      hub.create({ id: 'locked', name: 'Locked', description: 'Test', category: 'terminal' });

      const entries = hub.getLockEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('locked');
    });

    it('should update lock entries on skill update', () => {
      const hub = createHub();
      hub.create({
        id: 'v1',
        name: 'V1',
        description: 'Test',
        category: 'terminal',
        version: '1.0.0',
      });
      hub.update('v1', { version: '2.0.0' });

      const entry = hub.getLockEntries().find((e) => e.id === 'v1');
      expect(entry).toBeDefined();
      expect(entry!.version).toBe('2.0.0');
    });

    it('should remove lock entries on skill deletion', () => {
      const hub = createHub();
      hub.create({ id: 'gone', name: 'Gone', description: 'Test', category: 'terminal' });
      hub.delete('gone');

      const entries = hub.getLockEntries();
      expect(entries).toHaveLength(0);
    });
  });

  describe('Audit Integration', () => {
    it('should log create, update, delete operations', () => {
      const hub = createHub();
      hub.create({ id: 'audit-test', name: 'Audit', description: 'Test', category: 'terminal' });
      hub.update('audit-test', { name: 'Audited' });
      hub.delete('audit-test');

      const log = hub.getAuditLog();
      expect(log.getAll()).toHaveLength(3);
      expect(log.getByAction('create')).toHaveLength(1);
      expect(log.getByAction('update')).toHaveLength(1);
      expect(log.getByAction('delete')).toHaveLength(1);
    });
  });

  describe('Trust Management', () => {
    it('should set trust level manually', () => {
      const hub = createHub();
      hub.create({ id: 'trusted-one', name: 'Trusted', description: 'Test', category: 'terminal' });

      hub.setTrustLevel('trusted-one', 'restricted');
      expect(hub.get('trusted-one')!.trustLevel).toBe('restricted');
    });

    it('should add/remove trusted repos', () => {
      const hub = createHub();
      hub.addTrustedRepo('test/repo');
      expect(hub.isTrustedRepo('test/repo')).toBe(true);

      hub.removeTrustedRepo('test/repo');
      expect(hub.isTrustedRepo('test/repo')).toBe(false);
    });

    it('should resolve trust for git skills from trusted repos', () => {
      const hub = createHub();
      const meta = hub.create({
        id: 'trusted-git',
        name: 'Trusted Git',
        description: 'Test',
        category: 'terminal',
        source: 'git',
        repoUrl: 'https://github.com/ghita-corp/ghita-skills',
      });
      expect(meta.trustLevel).toBe('trusted');
    });
  });

  describe('Verification', () => {
    it('should verify a valid skill', () => {
      const hub = createHub();
      hub.create({ id: 'verify-ok', name: 'Verify OK', description: 'Test', category: 'terminal' });
      const result = hub.verify('verify-ok');
      expect(result.ok).toBe(true);
    });

    it('should detect tampered hash', () => {
      const hub = createHub();
      hub.create({
        id: 'verify-fail',
        name: 'Verify Fail',
        description: 'Test',
        category: 'terminal',
      });

      // Tamper with stored hash
      const meta = hub.get('verify-fail')!;
      meta.contentHash = 'tampered-hash';

      const result = hub.verify('verify-fail');
      expect(result.ok).toBe(false);
    });

    it('should verify all skills', () => {
      const hub = createHub();
      hub.create({ id: 'v1', name: 'V1', description: 'Test', category: 'terminal' });
      hub.create({ id: 'v2', name: 'V2', description: 'Test', category: 'terminal' });

      const results = hub.verifyAll();
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.ok)).toBe(true);
    });
  });

  describe('Stats', () => {
    it('should compute accurate stats', () => {
      const hub = createHub();
      hub.create({ id: 's1', name: 'S1', description: 'Test', category: 'terminal' });
      hub.create({ id: 's2', name: 'S2', description: 'Test', category: 'browser', source: 'hub' });
      hub.disable('s2');

      const stats = hub.stats();
      expect(stats.totalSkills).toBe(2);
      expect(stats.enabled).toBe(1);
      expect(stats.disabled).toBe(1);
      expect(stats.byTrustLevel.trusted).toBe(1);
      expect(stats.bySource.local).toBe(1);
      expect(stats.bySource.hub).toBe(1);
      expect(stats.byCategory.terminal).toBe(1);
      expect(stats.byCategory.browser).toBe(1);
      expect(stats.lockfileExists).toBe(true);
    });
  });

  describe('Persistence', () => {
    it('should load skills from disk on init', () => {
      const hubPath = path.join(tmpDir, 'hub');

      // Create first hub, add skills, dispose
      const hub1 = createHub();
      hub1.create({ id: 'persist', name: 'Persist', description: 'Test', category: 'terminal' });

      // Create second hub pointing to same path
      const hub2 = new HubRegistry({
        hubPath,
        lockfilePath: path.join(hubPath, 'lock.json'),
        auditLogPath: path.join(hubPath, 'audit.json'),
        trustedRepos: [...DEFAULT_TRUSTED_REPOS],
        autoVerify: false,
        maxAuditEntries: 100,
      });

      const loaded = hub2.get('persist');
      expect(loaded).toBeDefined();
      expect(loaded!.name).toBe('Persist');
    });
  });
});

// =============================================================================
// Skills Commands Tests
// =============================================================================
describe('Skills Commands', () => {
  beforeEach(() => makeTmpDir());
  afterEach(() => cleanTmpDir());

  function createHub(): HubRegistry {
    return new HubRegistry({
      hubPath: path.join(tmpDir, 'hub'),
      lockfilePath: path.join(tmpDir, 'hub', 'lock.json'),
      auditLogPath: path.join(tmpDir, 'hub', 'audit.json'),
      trustedRepos: [...DEFAULT_TRUSTED_REPOS],
      autoVerify: false,
      maxAuditEntries: 100,
    });
  }

  it('should register all /skills commands', () => {
    const hub = createHub();
    const commands = createSkillsCommands(hub);

    const triggers = commands.map((c) => c.trigger);
    expect(triggers).toContain('/skills list');
    expect(triggers).toContain('/skills create');
    expect(triggers).toContain('/skills info');
    expect(triggers).toContain('/skills search');
    expect(triggers).toContain('/skills delete');
    expect(triggers).toContain('/skills enable');
    expect(triggers).toContain('/skills disable');
    expect(triggers).toContain('/skills verify');
    expect(triggers).toContain('/skills audit');
    expect(triggers).toContain('/skills lock');
    expect(triggers).toContain('/skills trust');
  });

  describe('/skills create', () => {
    it('should create a skill', async () => {
      const hub = createHub();
      const commands = createSkillsCommands(hub);
      const cmd = commands.find((c) => c.trigger === '/skills create')!;

      const result = await cmd.execute('cmd-my-skill Cmd Skill --desc "A command skill"', {
        positional: ['cmd-my-skill', 'Cmd Skill'],
        flags: { desc: 'A command skill' },
      });

      expect(result).toContain('✅');
      expect(hub.get('cmd-my-skill')).toBeDefined();
    });
  });

  describe('/skills list', () => {
    it('should list skills', async () => {
      const hub = createHub();
      hub.create({ id: 'ls-1', name: 'List Me', description: 'Test', category: 'terminal' });

      const commands = createSkillsCommands(hub);
      const cmd = commands.find((c) => c.trigger === '/skills list')!;

      const result = await cmd.execute('', { positional: [], flags: {} });
      expect(result).toContain('List Me');
      expect(result).toContain('1 skill(s)');
    });
  });

  describe('/skills search', () => {
    it('should find skills', async () => {
      const hub = createHub();
      hub.create({
        id: 'search-git',
        name: 'Git Search',
        description: 'Search git',
        category: 'terminal',
        tags: ['git'],
      });

      const commands = createSkillsCommands(hub);
      const cmd = commands.find((c) => c.trigger === '/skills search')!;

      const result = await cmd.execute('git', { positional: [], flags: {} });
      expect(result).toContain('Git Search');
    });
  });

  describe('/skills delete', () => {
    it('should delete a skill', async () => {
      const hub = createHub();
      hub.create({ id: 'del-cmd', name: 'Delete Me', description: 'Test', category: 'terminal' });

      const commands = createSkillsCommands(hub);
      const cmd = commands.find((c) => c.trigger === '/skills delete')!;

      const result = await cmd.execute('del-cmd', { positional: [], flags: {} });
      expect(result).toContain('✅');
      expect(hub.get('del-cmd')).toBeUndefined();
    });
  });

  describe('/skills verify', () => {
    it('should verify all skills', async () => {
      const hub = createHub();
      hub.create({ id: 'vf-1', name: 'Verify 1', description: 'Test', category: 'terminal' });

      const commands = createSkillsCommands(hub);
      const cmd = commands.find((c) => c.trigger === '/skills verify')!;

      const result = await cmd.execute('', { positional: [], flags: {} });
      expect(result).toContain('passed');
    });
  });
});
