// ==============================================================================
// GHITA CODING AGENT - Skill Ratings Store
// Phase 2.3: Ratings, download tracking
// ==============================================================================

import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { SkillRating } from './types.js';

interface RatingsData {
  ratings: SkillRating[];
  downloads: Record<string, number>;
}

export class SkillRatingsStore {
  private readonly storePath: string;
  private data: RatingsData | null = null;

  constructor(storePath?: string) {
    this.storePath = storePath ?? join(homedir(), '.ghita', 'skills', 'ratings.json');
  }

  async rate(rating: SkillRating): Promise<void> {
    const data = await this.loadData();
    // Remove existing rating from same user for same skill
    data.ratings = data.ratings.filter(
      (r) => !(r.skillId === rating.skillId && r.userId === rating.userId),
    );
    data.ratings.push(rating);
    await this.saveData(data);
  }

  async getRatings(skillId: string): Promise<SkillRating[]> {
    const data = await this.loadData();
    return data.ratings.filter((r) => r.skillId === skillId);
  }

  async getAverageRating(skillId: string): Promise<number> {
    const ratings = await this.getRatings(skillId);
    if (ratings.length === 0) return 0;
    const sum = ratings.reduce((acc, r) => acc + r.score, 0);
    return sum / ratings.length;
  }

  async recordDownload(skillId: string): Promise<void> {
    const data = await this.loadData();
    data.downloads[skillId] = (data.downloads[skillId] ?? 0) + 1;
    await this.saveData(data);
  }

  async getDownloadCount(skillId: string): Promise<number> {
    const data = await this.loadData();
    return data.downloads[skillId] ?? 0;
  }

  async getTopSkills(limit = 10): Promise<Array<{ id: string; rating: number; downloads: number }>> {
    const data = await this.loadData();
    const skillIds = new Set([
      ...data.ratings.map((r) => r.skillId),
      ...Object.keys(data.downloads),
    ]);

    const skills = Array.from(skillIds).map((id) => {
      const ratings = data.ratings.filter((r) => r.skillId === id);
      const avgRating = ratings.length > 0 ? ratings.reduce((a, r) => a + r.score, 0) / ratings.length : 0;
      return {
        id,
        rating: avgRating,
        downloads: data.downloads[id] ?? 0,
      };
    });

    skills.sort((a, b) => b.downloads - a.downloads);
    return skills.slice(0, limit);
  }

  private async loadData(): Promise<RatingsData> {
    if (this.data) return this.data;
    try {
      const content = await readFile(this.storePath, 'utf8');
      this.data = JSON.parse(content) as RatingsData;
    } catch {
      this.data = { ratings: [], downloads: {} };
    }
    return this.data;
  }

  private async saveData(data: RatingsData): Promise<void> {
    this.data = data;
    const dir = this.storePath.substring(0, this.storePath.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
    await writeFile(this.storePath, JSON.stringify(data, null, 2), 'utf8');
  }
}
