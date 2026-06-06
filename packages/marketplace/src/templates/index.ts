// ==============================================================================
// GHITA CODING AGENT - Templates Module Barrel Export (Phase 36)
// ==============================================================================

// --- Types ---
export type {
  AgentTemplate,
  TemplateAuthor,
  TemplateCategory,
  AgentConfig,
  TemplateTool,
  CustomizationOption,
  TemplateStats,
  TemplateFork,
  TemplateDiff,
  TemplateReview,
  GallerySearchFilters,
  GallerySearchResult,
  CustomizationValues,
} from './types.js';

// --- Gallery ---
export { TemplateGallery } from './gallery.js';

// --- Customizer ---
export { TemplateCustomizer } from './customizer.js';
export type { ValidationError, CustomizationResult } from './customizer.js';

// --- Fork Manager ---
export { TemplateForkManager } from './fork.js';

// --- Review System ---
export { TemplateReviewSystem } from './reviews.js';
