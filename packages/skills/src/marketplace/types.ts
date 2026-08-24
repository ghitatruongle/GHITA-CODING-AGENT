import type { SkillCategory } from '@ghita/shared';

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  authorUrl?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  category: SkillCategory;
  tags: string[];
  icon?: string;
  entrypoint?: string;
  skills?: Array<{ id: string; name: string; description: string }>;
  dependencies?: Record<string, string>;
  permissions: string[];
  minAgentVersion?: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  publishedAt: number;
  updatedAt: number;
}

export interface InstalledSkill extends SkillManifest {
  installedAt: number;
  enabled: boolean;
  localPath: string;
}

export interface SkillCatalog {
  skills: SkillManifest[];
  total: number;
  page: number;
  pageSize: number;
  lastUpdated: number;
}

export interface CatalogFilters {
  category?: SkillCategory;
  tags?: string[];
  minRating?: number;
  sortBy?: 'downloads' | 'rating' | 'newest' | 'name';
}

export interface SkillRating {
  skillId: string;
  userId: string;
  score: number;
  comment?: string;
  timestamp: number;
}
