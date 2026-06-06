// ==============================================================================
// GHITA CODING AGENT - Phase 1: Unified LLMProvider Interface
// ==============================================================================
// Unified interface wrapping all LLM providers (Anthropic/OpenAI/Google/Groq/Mistral)
// with standardized streaming, config schema, and response buffering.
// ==============================================================================

import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ProviderConfig,
  TokenUsage,
} from '../types.js';

// ---------------------------------------------------------------------------
// LLMProvider — the single unified interface for all LLM backends
// ---------------------------------------------------------------------------

/**
 * Unified LLM provider interface.
 *
 * Every provider (Anthropic, OpenAI, Google, Groq, Mistral, Ollama, etc.)
 * implements this contract so consumers interact with a single, consistent API
 * regardless of the underlying vendor.
 */
export interface LLMProvider extends AIProvider {
  /** Unique provider identifier (e.g. 'openai', 'anthropic') */
  readonly type: AIProviderType;
  /** Human-readable display name */
  readonly name: string;
  /** Default model when none is specified */
  readonly defaultModel: string;
  /** List of supported model identifiers (empty = dynamic) */
  readonly models: string[];

  // --- Core chat ---
  isReady(): Promise<boolean>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;

  // --- Metadata ---
  /** Returns the list of models available from this provider */
  listModels?(): Promise<string[]>;
  /** Returns provider capabilities (streaming, embeddings, vision, etc.) */
  getCapabilities(): ProviderCapabilities;
}

// ---------------------------------------------------------------------------
// Capabilities descriptor
// ---------------------------------------------------------------------------

export interface ProviderCapabilities {
  streaming: boolean;
  embeddings: boolean;
  imageGeneration: boolean;
  speechSynthesis: boolean;
  speechRecognition: boolean;
  videoGeneration: boolean;
  functionCalling: boolean;
  visionInput: boolean;
  reasoningTokens: boolean;
}

// ---------------------------------------------------------------------------
// SSE Stream Event types (POST /chat/stream → event-stream)
// ---------------------------------------------------------------------------

export type SSEEventType =
  | 'message_start'
  | 'content_delta'
  | 'content_done'
  | 'message_stop'
  | 'error'
  | 'usage'
  | 'ping';

export interface SSEStreamEvent {
  type: SSEEventType;
  data: {
    content?: string;
    provider?: AIProviderType;
    model?: string;
    usage?: TokenUsage;
    finishReason?: 'stop' | 'length' | 'error' | 'aborted';
    error?: string;
    timestamp: number;
  };
}

// ---------------------------------------------------------------------------
// Response Buffer types — partial JSON assembly for streaming
// ---------------------------------------------------------------------------

export interface ResponseBufferState {
  /** Accumulated raw bytes/text from the stream */
  buffer: string;
  /** Whether the stream is complete */
  complete: boolean;
  /** Parsed partial chunks so far */
  chunks: AIStreamChunk[];
  /** Total tokens estimated from accumulated content */
  estimatedTokens: number;
  /** Timestamp when buffering started */
  startedAt: number;
}

// ---------------------------------------------------------------------------
// Provider YAML Config types
// ---------------------------------------------------------------------------

export interface ProviderYAMLConfig {
  /** Provider identifier */
  type: AIProviderType;
  /** Display name override */
  name?: string;
  /** API key(s) — can be single or multi-key */
  apiKey?: string;
  apiKeys?: string[];
  /** Key rotation strategy */
  rotationStrategy?: 'round-robin' | 'failover' | 'random';
  /** Base URL for API calls */
  baseUrl?: string;
  /** Default model identifier */
  defaultModel?: string;
  /** Max tokens per response */
  maxTokens?: number;
  /** Temperature for generation (0.0 – 2.0) */
  temperature?: number;
  /** Top-P sampling */
  topP?: number;
  /** Stop sequences */
  stop?: string[];
  /** Custom headers to include in API requests */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
  };
}

export interface ProvidersYAMLRoot {
  /** Schema version for forward-compat */
  version: 1;
  /** Default provider type */
  defaultProvider?: AIProviderType;
  /** All provider configurations */
  providers: ProviderYAMLConfig[];
  /** Global streaming options */
  streaming?: {
    enabled: boolean;
    smoothDelayMs?: number;
    chunkSize?: number;
  };
}

// ---------------------------------------------------------------------------
// Helper: derive ProviderConfig (internal) from ProviderYAMLConfig
// ---------------------------------------------------------------------------

export function yamlToProviderConfig(yaml: ProviderYAMLConfig): ProviderConfig {
  return {
    type: yaml.type,
    apiKey: yaml.apiKey,
    apiKeys: yaml.apiKeys,
    rotationStrategy: yaml.rotationStrategy,
    baseUrl: yaml.baseUrl,
    defaultModel: yaml.defaultModel,
    maxTokens: yaml.maxTokens,
    temperature: yaml.temperature,
    providerType: yaml.type,
    providerName: yaml.name,
  };
}
