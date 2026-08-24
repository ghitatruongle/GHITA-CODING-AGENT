// Pre-built agent template catalog with search and browsing

import type {
  AgentTemplate,
  GallerySearchFilters,
  GallerySearchResult,
  TemplateCategory,
} from './types.js';

/**
 * Template Gallery — manages a catalog of pre-built agent templates.
 * Supports search, filtering, browsing, and featured templates.
 */
export class TemplateGallery {
  private templates = new Map<string, AgentTemplate>();
  private categoryIndex = new Map<TemplateCategory, Set<string>>();
  private tagIndex = new Map<string, Set<string>>();

  /**
   * Add a template to the gallery.
   */
  addTemplate(template: AgentTemplate): void {
    this.templates.set(template.id, template);

    // Category index
    if (!this.categoryIndex.has(template.category)) {
      this.categoryIndex.set(template.category, new Set());
    }
    this.categoryIndex.get(template.category)?.add(template.id);

    // Tag index
    for (const tag of template.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)?.add(template.id);
    }
  }

  /**
   * Remove a template from the gallery.
   */
  removeTemplate(templateId: string): boolean {
    const template = this.templates.get(templateId);
    if (!template) return false;

    this.templates.delete(templateId);

    // Clean category index
    const catSet = this.categoryIndex.get(template.category);
    if (catSet) {
      catSet.delete(templateId);
      if (catSet.size === 0) this.categoryIndex.delete(template.category);
    }

    // Clean tag index
    for (const tag of template.tags) {
      const tagSet = this.tagIndex.get(tag);
      if (tagSet) {
        tagSet.delete(templateId);
        if (tagSet.size === 0) this.tagIndex.delete(tag);
      }
    }

    return true;
  }

  /**
   * Get a template by ID.
   */
  getTemplate(templateId: string): AgentTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Search templates with filters.
   */
  search(filters?: GallerySearchFilters): GallerySearchResult {
    let results = Array.from(this.templates.values());

    // Text search
    if (filters?.query) {
      const q = filters.query.toLowerCase();
      results = results.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    // Category filter
    if (filters?.category) {
      results = results.filter((t) => t.category === filters.category);
    }

    // Tags filter
    if (filters?.tags?.length) {
      results = results.filter((t) => filters.tags?.some((tag) => t.tags.includes(tag)) ?? false);
    }

    // Min rating filter
    if (filters?.minRating !== undefined) {
      results = results.filter((t) => t.stats.rating >= (filters.minRating ?? 0));
    }

    // Featured filter
    if (filters?.featured !== undefined) {
      results = results.filter((t) => t.featured === filters.featured);
    }

    // Author filter
    if (filters?.author) {
      results = results.filter((t) => t.author.id === filters.author);
    }

    // Sorting
    if (filters?.sortBy) {
      switch (filters.sortBy) {
        case 'popular':
          results.sort((a, b) => b.stats.usageCount - a.stats.usageCount);
          break;
        case 'rating':
          results.sort((a, b) => b.stats.rating - a.stats.rating);
          break;
        case 'newest':
          results.sort((a, b) => b.createdAt - a.createdAt);
          break;
        case 'name':
          results.sort((a, b) => a.name.localeCompare(b.name));
          break;
      }
    }

    const total = results.length;
    const page = 1;
    const pageSize = 50;

    return {
      templates: results.slice(0, pageSize),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get featured templates.
   */
  getFeatured(limit = 10): AgentTemplate[] {
    return Array.from(this.templates.values())
      .filter((t) => t.featured)
      .sort((a, b) => b.stats.usageCount - a.stats.usageCount)
      .slice(0, limit);
  }

  /**
   * Get templates by category.
   */
  getByCategory(category: TemplateCategory): AgentTemplate[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.templates.get(id))
      .filter((t): t is AgentTemplate => t !== undefined);
  }

  /**
   * Get all available categories.
   */
  getCategories(): TemplateCategory[] {
    return Array.from(this.categoryIndex.keys());
  }

  /**
   * Get popular tags.
   */
  getPopularTags(limit = 20): Array<{ tag: string; count: number }> {
    return Array.from(this.tagIndex.entries())
      .map(([tag, ids]) => ({ tag, count: ids.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get gallery statistics.
   */
  get stats(): { totalTemplates: number; totalCategories: number; totalTags: number } {
    return {
      totalTemplates: this.templates.size,
      totalCategories: this.categoryIndex.size,
      totalTags: this.tagIndex.size,
    };
  }

  get size(): number {
    return this.templates.size;
  }
}
