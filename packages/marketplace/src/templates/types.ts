// ==============================================================================
// GHITA CODING AGENT - Agent Template Types (Phase 36)
// ==============================================================================

/** Agent template definition */
export interface AgentTemplate {
  /** Unique template ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this agent does */
  description: string;
  /** Template version */
  version: string;
  /** Author info */
  author: TemplateAuthor;
  /** Template category */
  category: TemplateCategory;
  /** Searchable tags */
  tags: string[];
  /** Icon URL or emoji */
  icon?: string;
  /** Preview image URL */
  previewImage?: string;
  /** Agent configuration */
  config: AgentConfig;
  /** System prompt template */
  systemPrompt: string;
  /** Tool definitions */
  tools: TemplateTool[];
  /** Customization options */
  customizationOptions: CustomizationOption[];
  /** Template statistics */
  stats: TemplateStats;
  /** License */
  license?: string;
  /** Whether this is a featured/official template */
  featured: boolean;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

/** Template author information */
export interface TemplateAuthor {
  id: string;
  name: string;
  avatar?: string;
  verified: boolean;
}

/** Template categories */
export type TemplateCategory =
  | 'coding'
  | 'writing'
  | 'analysis'
  | 'research'
  | 'creative'
  | 'productivity'
  | 'devops'
  | 'data'
  | 'customer-support'
  | 'education';

/** Agent configuration within template */
export interface AgentConfig {
  /** Preferred model provider */
  preferredProvider?: string;
  /** Preferred model */
  preferredModel?: string;
  /** Temperature setting */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
  /** Context window preference */
  contextWindow?: number;
  /** Enable streaming */
  streaming?: boolean;
  /** Custom settings */
  settings?: Record<string, unknown>;
}

/** Tool definition in template */
export interface TemplateTool {
  name: string;
  description: string;
  required: boolean;
  config?: Record<string, unknown>;
}

/** Customization option for template wizard */
export interface CustomizationOption {
  /** Option key */
  key: string;
  /** Display label */
  label: string;
  /** Description */
  description?: string;
  /** Option type */
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'textarea';
  /** Default value */
  defaultValue: unknown;
  /** Available choices (for select/multiselect) */
  choices?: Array<{ value: string; label: string }>;
  /** Validation rules */
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
  };
  /** Whether this option is visible in wizard */
  visible: boolean;
}

/** Template usage statistics */
export interface TemplateStats {
  /** Number of times used/cloned */
  usageCount: number;
  /** Number of forks */
  forkCount: number;
  /** Average rating (0-5) */
  rating: number;
  /** Number of reviews */
  reviewCount: number;
  /** Download count */
  downloads: number;
}

/** Template fork/clone */
export interface TemplateFork {
  /** Fork ID */
  id: string;
  /** Original template ID */
  sourceTemplateId: string;
  /** Forked by user */
  forkedBy: string;
  /** Fork timestamp */
  forkedAt: number;
  /** Customized template data */
  template: AgentTemplate;
  /** Changes made from original */
  changes: TemplateDiff;
}

/** Diff between original and forked template */
export interface TemplateDiff {
  /** Changed fields */
  modified: string[];
  /** Added tools */
  addedTools: string[];
  /** Removed tools */
  removedTools: string[];
  /** Modified config keys */
  modifiedConfig: string[];
}

/** Template review */
export interface TemplateReview {
  /** Review ID */
  id: string;
  /** Template ID */
  templateId: string;
  /** Reviewer info */
  reviewer: {
    id: string;
    name: string;
    avatar?: string;
  };
  /** Rating (1-5) */
  rating: number;
  /** Review title */
  title: string;
  /** Review content */
  content: string;
  /** Helpful votes */
  helpfulCount: number;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

/** Gallery search filters */
export interface GallerySearchFilters {
  query?: string;
  category?: TemplateCategory;
  tags?: string[];
  minRating?: number;
  featured?: boolean;
  author?: string;
  sortBy?: 'popular' | 'rating' | 'newest' | 'name';
}

/** Gallery search result */
export interface GallerySearchResult {
  templates: AgentTemplate[];
  total: number;
  page: number;
  pageSize: number;
}

/** Customization values submitted from wizard */
export type CustomizationValues = Record<string, unknown>;
