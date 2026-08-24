export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  capabilities?: string[];
  deprecated?: boolean;
}

export interface DiscoveryResult {
  models: ModelInfo[];
  fetchedAt: number;
  ttl: number;
  source: 'api' | 'config' | 'cache';
}

export type AuthStyle = 'bearer' | 'x-api-key' | 'query-param';

export interface DiscoveryConfig {
  baseUrl: string;
  apiKey?: string;
  providerType: string;
  authStyle: AuthStyle;
  parseResponse: (data: unknown) => ModelInfo[];
  ttlMs?: number;
}
