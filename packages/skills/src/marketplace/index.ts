// ==============================================================================
// GHITA CODING AGENT - Marketplace Barrel Export
// ==============================================================================

export { SkillCatalogClient } from './catalog.js';
export { SkillInstaller } from './installer.js';
export { SkillRatingsStore } from './ratings.js';
export { getDefaultCatalog } from './defaultCatalog.js';

// v0.4.9 A10: Skill pack importer + curated Community Essentials pack
export {
  SkillPackImporter,
  COMMUNITY_ESSENTIALS,
  MIT_COMPATIBLE_LICENSES,
} from './skill-pack-importer.js';
export type {
  RawSkillEntry,
  RawSkillPack,
  SkippedSkill,
  SkillPackImportResult,
} from './skill-pack-importer.js';
export type {
  SkillManifest,
  InstalledSkill,
  SkillCatalog,
  CatalogFilters,
  SkillRating,
} from './types.js';
