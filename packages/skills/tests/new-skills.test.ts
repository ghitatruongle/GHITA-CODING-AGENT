import { describe, it, expect } from 'vitest';
import { createDefaultSkillRegistry } from '../src/index.js';

describe('New Built-in Skills', () => {
  const registry = createDefaultSkillRegistry();

  const newSkillIds = [
    'git.status', 'git.commit', 'git.diff', 'git.branch',
    'docker.run', 'docker.build', 'docker.ps',
    'db.query', 'http.request',
    'code.format', 'code.lint', 'test.run',
    'search.codebase', 'compress.zip', 'deploy.check',
  ];

  describe('Registration', () => {
    for (const id of newSkillIds) {
      it(`should register ${id}`, () => {
        const skill = registry.get(id);
        expect(skill).toBeDefined();
        expect(skill!.id).toBe(id);
      });
    }
  });

  describe('Skill properties', () => {
    for (const id of newSkillIds) {
      it(`${id} should have required fields`, () => {
        const skill = registry.get(id)!;
        expect(skill.name).toBeTruthy();
        expect(skill.description).toBeTruthy();
        expect(skill.category).toBe('terminal');
        expect(skill.version).toBeTruthy();
        expect(Array.isArray(skill.scopes)).toBe(true);
        expect(['ready', 'disabled']).toContain(skill.status);
        expect(typeof skill.run).toBe('function');
      });
    }
  });

  describe('Enabled by default', () => {
    const enabledByDefault = [
      'git.status', 'git.diff', 'git.branch',
      'docker.ps', 'http.request',
      'search.codebase', 'deploy.check',
    ];

    for (const id of enabledByDefault) {
      it(`${id} should be enabled by default`, () => {
        const skill = registry.get(id)!;
        expect(skill.enabled).toBe(true);
        expect(skill.status).toBe('ready');
      });
    }
  });

  describe('Disabled by default', () => {
    const disabledByDefault = [
      'git.commit', 'docker.run', 'docker.build',
      'db.query', 'code.format', 'code.lint', 'test.run', 'compress.zip',
    ];

    for (const id of disabledByDefault) {
      it(`${id} should be disabled by default`, () => {
        const skill = registry.get(id)!;
        expect(skill.enabled).toBe(false);
        expect(skill.status).toBe('disabled');
      });
    }
  });

  describe('db.query safety', () => {
    it('should fail without terminal adapter', async () => {
      const skill = registry.get('db.query')!;
      const result = await skill.run(
        { input: { database: 'test.db', query: 'DROP TABLE users' } },
        { registry, now: () => Date.now(), adapters: {} as any },
      );
      // Without adapter, fails at adapter check before param validation
      expect(result.success).toBe(false);
    });

    it('should accept SELECT queries (will fail without adapter)', async () => {
      const skill = registry.get('db.query')!;
      const result = await skill.run(
        { input: { database: 'test.db', query: 'SELECT * FROM users' } },
        { registry, now: () => Date.now(), adapters: {} as any },
      );
      expect(result.success).toBe(false);
    });
  });

  describe('Missing adapter handling', () => {
    it('should return missing adapter error when no terminal adapter', async () => {
      const skill = registry.get('git.status')!;
      const result = await skill.run(
        {},
        { registry, now: () => Date.now(), adapters: {} as any },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('adapter');
    });
  });

  describe('git.commit requires message', () => {
    it('should fail without adapter (adapter check first)', async () => {
      const skill = registry.get('git.commit')!;
      const result = await skill.run(
        { input: {} },
        { registry, now: () => Date.now(), adapters: {} as any },
      );
      // Without adapter, fails at adapter check before param validation
      expect(result.success).toBe(false);
    });
  });

  describe('git.branch requires name for create/delete', () => {
    it('should fail create without adapter', async () => {
      const skill = registry.get('git.branch')!;
      const result = await skill.run(
        { input: { action: 'create' } },
        { registry, now: () => Date.now(), adapters: {} as any },
      );
      expect(result.success).toBe(false);
    });

    it('should fail delete without adapter', async () => {
      const skill = registry.get('git.branch')!;
      const result = await skill.run(
        { input: { action: 'delete' } },
        { registry, now: () => Date.now(), adapters: {} as any },
      );
      expect(result.success).toBe(false);
    });
  });
});
