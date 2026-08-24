import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadSkillMd,
  validateSkill,
  SkillDirectoryWatcher,
  SkillRegistry,
  SessionSkillRegistry,
} from '../src/index.js';

describe('Markdown Skill Loader & Session Isolation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(tmpdir(), `ghita-skills-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('validateSkill', () => {
    it('should pass on a valid skill', () => {
      const skill: any = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'Test Description',
        category: 'terminal',
        enabled: true,
      };
      expect(() => validateSkill(skill)).not.toThrow();
    });

    it('should throw error on missing essential fields', () => {
      const skill: any = {
        id: 'test-skill',
        category: 'terminal',
      };
      expect(() => validateSkill(skill)).toThrow(/validation failed/);
    });

    it('should throw error on invalid category', () => {
      const skill: any = {
        id: 'test-skill',
        name: 'Test',
        description: 'Desc',
        category: 'invalid-category',
      };
      expect(() => validateSkill(skill)).toThrow(/Skill category must be one of/);
    });
  });

  describe('loadSkillMd', () => {
    it('should successfully parse a valid SKILL.md file', () => {
      const skillMdContent = `---
name: mock-accessibility-auditor
description: Audits UI accessibility.
category: computer
version: 1.2.0
scopes: workspace
---
# Instructions
Make sure elements have high contrast.
`;
      const filePath = path.join(tempDir, 'SKILL.md');
      fs.writeFileSync(filePath, skillMdContent, 'utf-8');

      const skill = loadSkillMd(filePath);
      expect(skill.id).toBe('mock-accessibility-auditor');
      expect(skill.name).toBe('mock-accessibility-auditor');
      expect(skill.description).toBe('Audits UI accessibility.');
      expect(skill.category).toBe('computer');
      expect(skill.version).toBe('1.2.0');
      expect(skill.scopes).toEqual(['workspace']);
      expect((skill as any).instructions).toContain('Make sure elements have high contrast.');
    });
  });

  describe('SkillDirectoryWatcher', () => {
    it('should detect added, updated, and deleted SKILL.md files in real-time', async () => {
      const registry = new SkillRegistry();
      const watcher = new SkillDirectoryWatcher(tempDir, registry);

      watcher.start();

      // Create a subfolder with SKILL.md
      const subDir = path.join(tempDir, 'test-added-skill');
      fs.mkdirSync(subDir);
      const filePath = path.join(subDir, 'SKILL.md');

      const mdContent = `---
name: dynamic-skill
description: Dynamic test description
category: terminal
---
# Main Content
Instructions content
`;

      fs.writeFileSync(filePath, mdContent, 'utf-8');

      // Wait for watcher to trigger
      await new Promise((resolve) => setTimeout(resolve, 300));

      let skill = registry.get('dynamic-skill');
      expect(skill).toBeDefined();
      expect(skill?.description).toBe('Dynamic test description');

      // Update the file
      const updatedMdContent = `---
name: dynamic-skill
description: Dynamic test description - updated
category: terminal
---
# Main Content
Updated instructions
`;

      fs.writeFileSync(filePath, updatedMdContent, 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, 300));

      skill = registry.get('dynamic-skill');
      expect(skill?.description).toBe('Dynamic test description - updated');

      // Delete the file
      fs.unlinkSync(filePath);
      await new Promise((resolve) => setTimeout(resolve, 300));

      skill = registry.get('dynamic-skill');
      expect(skill).toBeUndefined();

      watcher.close();
    });
  });

  describe('SessionSkillRegistry Isolation', () => {
    it('should isolate enable/disable status per session', async () => {
      const parentRegistry = new SkillRegistry();

      // Register a parent skill
      const baseSkill: any = {
        id: 'isolated-skill',
        name: 'Isolated Skill',
        description: 'Test Description',
        category: 'computer',
        enabled: true,
        version: '0.1.0',
        scopes: ['workspace'],
        status: 'ready',
        run: async () => ({ success: true, output: 'Success' }),
      };
      parentRegistry.register(baseSkill);

      // Fork registry for two separate sessions
      const session1 = parentRegistry.fork('session-1');
      const session2 = parentRegistry.fork('session-2');

      // Disable in session 1
      session1.setEnabled('isolated-skill', false);

      // Should be disabled in session 1
      const skill1 = session1.get('isolated-skill');
      expect(skill1?.enabled).toBe(false);
      expect(skill1?.status).toBe('disabled');
      const run1 = await session1.run('isolated-skill');
      expect(run1.success).toBe(false);
      expect(run1.error).toContain('disabled in session');

      // Should remain enabled in session 2
      const skill2 = session2.get('isolated-skill');
      expect(skill2?.enabled).toBe(true);
      expect(skill2?.status).toBe('ready');
      const run2 = await session2.run('isolated-skill');
      expect(run2.success).toBe(true);

      // Should remain enabled in parent registry
      expect(parentRegistry.get('isolated-skill')?.enabled).toBe(true);
    });
  });
});
