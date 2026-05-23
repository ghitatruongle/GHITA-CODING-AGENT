// ==============================================================================
// GHITA CODING AGENT - Hub Integration Types
// ==============================================================================

export interface HubPrompt {
  /** Prompt ID in the hub */
  id: string;
  /** Prompt name */
  name: string;
  /** Prompt version */
  version: string;
  /** Prompt template */
  template: string;
  /** Input variables */
  variables: string[];
  /** Associated model */
  model?: string;
  /** Associated provider */
  provider?: string;
  /** Description */
  description?: string;
  /** Tags for categorization */
  tags: string[];
  /** Author */
  author?: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

export interface HubConfig {
  /** Hub server URL */
  serverUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Default namespace */
  namespace?: string;
  /** Cache TTL in ms */
  cacheTtl?: number;
}

export interface HubSearchQuery {
  /** Text query */
  query?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by model */
  model?: string;
  /** Filter by author */
  author?: string;
  /** Max results */
  limit?: number;
}

export interface HubPushInput {
  /** Prompt name */
  name: string;
  /** Prompt template */
  template: string;
  /** Description */
  description?: string;
  /** Tags */
  tags?: string[];
  /** Associated model */
  model?: string;
  /** Associated provider */
  provider?: string;
  /** Whether to create a new version */
  newVersion?: boolean;
}

export interface HubCacheEntry {
  prompt: HubPrompt;
  cachedAt: number;
  ttl: number;
}
