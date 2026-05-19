// ==============================================================================
// GHITA CODING AGENT - AI Engine Package Entry
// ==============================================================================

// --- Types ---
export type {
  AIProvider,
  ChatMessage,
  ChatRole,
  ChatOptions,
  ChatResponse,
  TokenUsage,
  ProviderConfig,
  OrchestratorConfig,
  OrchestratorStatus,
} from './types.js';

// --- Providers ---
export { BaseProvider } from './providers/base.js';
export { OpenAIProvider } from './providers/openai.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { GoogleProvider } from './providers/google.js';
export { OllamaProvider } from './providers/ollama.js';
export { CustomProvider } from './providers/custom.js';

// --- Registry & Orchestrator ---
export { ProviderRegistry } from './registry.js';
export { Orchestrator } from './orchestrator.js';
