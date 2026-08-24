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

  /**
   * Compare semver version strings (e.g. "1.2.3").
   * Note: Pre-release suffixes (e.g. "1.0.0-beta") are stripped before comparison.
   * @returns negative if a < b, positive if a > b, 0 if equal
   */
  compareVersions(a: string, b: string): number {
    // Strip pre-release suffixes (e.g. "1.0.0-beta" -> "1.0.0")
    const cleanA = a.split('-')[0] ?? a;
    const cleanB = b.split('-')[0] ?? b;
    const pa = cleanA.split('.').map(Number);
    const pb = cleanB.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }
}
