import { describe, it, expect } from 'vitest';
import { getDefaultCatalog } from '../src/marketplace/defaultCatalog.js';

describe('Marketplace', () => {
  describe('getDefaultCatalog', () => {
    it('should return 20 skills', () => {
      const catalog = getDefaultCatalog();
      expect(catalog).toHaveLength(20);
    });

    it('should have valid manifest structure', () => {
      const catalog = getDefaultCatalog();
      for (const skill of catalog) {
        expect(skill.id).toBeTruthy();
        expect(skill.name).toBeTruthy();
        expect(skill.description).toBeTruthy();
        expect(skill.version).toBeTruthy();
        expect(skill.author).toBeTruthy();
        expect(skill.category).toBeTruthy();
        expect(Array.isArray(skill.tags)).toBe(true);
        expect(Array.isArray(skill.permissions)).toBe(true);
        expect(typeof skill.downloads).toBe('number');
        expect(typeof skill.rating).toBe('number');
        expect(typeof skill.ratingCount).toBe('number');
        expect(typeof skill.publishedAt).toBe('number');
        expect(typeof skill.updatedAt).toBe('number');
      }
    });

    it('should have unique IDs', () => {
      const catalog = getDefaultCatalog();
      const ids = catalog.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have ratings between 0 and 5', () => {
      const catalog = getDefaultCatalog();
      for (const skill of catalog) {
        expect(skill.rating).toBeGreaterThanOrEqual(0);
        expect(skill.rating).toBeLessThanOrEqual(5);
      }
    });

    it('should have non-negative downloads', () => {
      const catalog = getDefaultCatalog();
      for (const skill of catalog) {
        expect(skill.downloads).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
