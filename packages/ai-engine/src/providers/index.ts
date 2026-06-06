// ==============================================================================
// GHITA CODING AGENT - Phase 1: Provider Barrel Export
// ==============================================================================

// --- Providers ---
export { BaseProvider } from './base.js';
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { GoogleProvider } from './google.js';
export { OllamaProvider } from './ollama.js';
export { CustomProvider } from './custom.js';
export { GroqProvider } from './groq.js';
export { MistralProvider } from './mistral.js';

// --- Phase 6: defineVendor + new providers ---
export { defineVendor, type VendorSpec } from './base-extended.js';
export { KimiProvider } from './kimi.js';
export { MiniMaxProvider } from './minimax.js';
export { DeepSeekProvider } from './deepseek.js';
export {
  OAUTH_PROVIDERS,
  getOAuthProvider,
  listOAuthProviders,
  type OAuthProviderSpec,
} from './oauth-registry.js';

// --- Types ---
export type {
  LLMProvider,
  ProviderCapabilities,
  SSEEventType,
  SSEStreamEvent,
  ResponseBufferState,
  ProviderYAMLConfig,
  ProvidersYAMLRoot,
} from './types.js';
export { yamlToProviderConfig } from './types.js';

// --- SSE Streaming ---
export { SSEEncoder, SSEDecoder, ResponseBuffer, toSSEStream } from './sse-stream.js';

// --- Config Schema ---
export {
  ProviderYAMLConfigSchema,
  ProvidersYAMLRootSchema,
  ProviderConfigLoader,
  parseSimpleYAML,
} from './config-schema.js';
