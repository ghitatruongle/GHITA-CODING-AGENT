import type { SkillManifest, SkillCatalog, CatalogFilters } from './types.js';
import { getDefaultCatalog } from './defaultCatalog.js';

const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/ghita/skills-catalog/main/catalog.json';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class SkillCatalogClient {
  private readonly catalogUrl: string;
  private cache: SkillCatalog | null = null;
  private cacheExpiry = 0;

  constructor(catalogUrl?: string) {
    this.catalogUrl = catalogUrl ?? DEFAULT_CATALOG_URL;
  }

  async fetchCatalog(page = 1, pageSize = 50): Promise<SkillCatalog> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) {
      return this.paginate(this.cache.skills, page, pageSize);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(this.catalogUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { skills: SkillManifest[] };
      const skills = data.skills ?? [];

      this.cache = {
        skills,
        total: skills.length,
        page: 1,
        pageSize: skills.length,
        lastUpdated: now,
      };
      this.cacheExpiry = now + CACHE_TTL_MS;

      return this.paginate(skills, page, pageSize);
    } catch {
      // Fallback to default catalog
      const skills = getDefaultCatalog();
      this.cache = {
        skills,
        total: skills.length,
        page: 1,
        pageSize: skills.length,
        lastUpdated: now,
      };
      this.cacheExpiry = now + CACHE_TTL_MS;
      return this.paginate(skills, page, pageSize);
    }
  }

  async search(query: string, filters?: CatalogFilters): Promise<SkillManifest[]> {
    const catalog = await this.fetchCatalog(1, 1000);
    const lower = query.toLowerCase();
    let results = catalog.skills.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower) ||
        s.tags.some((t) => t.toLowerCase().includes(lower)),
    );

    if (filters?.category) {
      results = results.filter((s) => s.category === filters.category);
    }
    if (filters?.minRating) {
      results = results.filter((s) => s.rating >= (filters.minRating ?? 0));
    }
    if (filters?.tags && filters.tags.length > 0) {
      const filterTags = filters.tags;
      results = results.filter((s) => filterTags.some((t) => s.tags.includes(t)));
    }

    // Sort
    const sortBy = filters?.sortBy ?? 'downloads';
    results.sort((a, b) => {
      if (sortBy === 'downloads') return b.downloads - a.downloads;
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'newest') return b.publishedAt - a.publishedAt;
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  async getSkill(id: string): Promise<SkillManifest | null> {
    const catalog = await this.fetchCatalog(1, 1000);
    return catalog.skills.find((s) => s.id === id) ?? null;
  }

  async getVersions(id: string): Promise<string[]> {
    const skill = await this.getSkill(id);
    return skill ? [skill.version] : [];
  }

  clearCache(): void {
    this.cache = null;
    this.cacheExpiry = 0;
  }

  private paginate(skills: SkillManifest[], page: number, pageSize: number): SkillCatalog {
    const start = (page - 1) * pageSize;
    return {
      skills: skills.slice(start, start + pageSize),
      total: skills.length,
      page,
      pageSize,
      lastUpdated: Date.now(),
    };
  }
}
