// ==============================================================================
// GHITA CODING AGENT - Skill Installer
// Phase 2.3: Install, uninstall, update skills from marketplace
// ==============================================================================

import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import type { SkillManifest, InstalledSkill } from './types.js';

export class SkillInstaller {
  private readonly installDir: string;

  constructor(options?: { installDir?: string }) {
    this.installDir = options?.installDir ?? join(homedir(), '.ghita', 'skills', 'installed');
  }

  async install(manifest: SkillManifest): Promise<InstalledSkill> {
    const skillDir = join(this.installDir, manifest.id);
    await mkdir(skillDir, { recursive: true });

    const installed: InstalledSkill = {
      ...manifest,
      installedAt: Date.now(),
      enabled: true,
      localPath: skillDir,
    };

    await writeFile(join(skillDir, 'manifest.json'), JSON.stringify(installed, null, 2), 'utf8');
    return installed;
  }

  async uninstall(id: string): Promise<boolean> {
    const skillDir = join(this.installDir, id);
    try {
      await rm(skillDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  async listInstalled(): Promise<InstalledSkill[]> {
    try {
      await mkdir(this.installDir, { recursive: true });
      const entries = await readdir(this.installDir, { withFileTypes: true });
      const skills: InstalledSkill[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const manifestPath = join(this.installDir, entry.name, 'manifest.json');
          const content = await readFile(manifestPath, 'utf8');
          skills.push(JSON.parse(content) as InstalledSkill);
        } catch {
          // Skip invalid entries
        }
      }

      return skills;
    } catch {
      return [];
    }
  }

  async isInstalled(id: string): Promise<boolean> {
    try {
      const manifestPath = join(this.installDir, id, 'manifest.json');
      await readFile(manifestPath, 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  async getInstalled(id: string): Promise<InstalledSkill | null> {
    try {
      const manifestPath = join(this.installDir, id, 'manifest.json');
      const content = await readFile(manifestPath, 'utf8');
      return JSON.parse(content) as InstalledSkill;
    } catch {
      return null;
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    const skill = await this.getInstalled(id);
    if (!skill) return false;
    skill.enabled = enabled;
    const manifestPath = join(this.installDir, id, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(skill, null, 2), 'utf8');
    return true;
  }

  compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }
}
