import type { AIProviderType, AIStreamChunk } from '@ghita/shared';

export interface PermissionContext {
  cwd?: string;
  filePath?: string;
  command?: string;
  stepIndex?: number;
  [key: string]: unknown;
}

// --- Provider Interface ---
export interface AIProvider {
  readonly type: AIProviderType;
  readonly name: string;
  readonly defaultModel: string;
  readonly models: string[];

  isReady(): Promise<boolean>;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;

  test(): Promise<boolean>;

  embed(text: string, options?: { model?: string }): Promise<EmbeddingResponse>;

  embedMany(texts: string[], options?: { model?: string }): Promise<EmbeddingManyResponse>;

  generateImage?(
    prompt: string,
    options?: Record<string, unknown>,
  ): Promise<{ url: string; b64?: string }>;

  generateSpeech?(
    text: string,
    options?: Record<string, unknown>,
  ): Promise<{ audio: Buffer; contentType: string }>;

  generateVideo?(prompt: string, options?: Record<string, unknown>): Promise<{ url: string }>;

  transcribe?(audio: Buffer, options?: Record<string, unknown>): Promise<{ text: string }>;
}

// --- Chat Types ---
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Required for a `tool` role message. */
  toolCallId?: string;
  /** Provider-native calls produced by an assistant message. */
  toolCalls?: ChatToolCall[];
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  signal?: AbortSignal;
  agentRole?: 'Explore' | 'Plan' | 'UI' | 'default';
  tools?: ChatToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: AIProviderType;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'error' | 'aborted';
  /** Provider-native function calls, normalized by the runtime before agent execution. */
  toolCalls?: ChatToolCall[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// --- Key Rotation ---
export type KeyRotationStrategy = 'round-robin' | 'failover' | 'random';

// --- Provider Config ---
export interface ProviderConfig {
  type: AIProviderType;
  apiKey?: string;
  
  apiKeys?: string[];
  
  rotationStrategy?: KeyRotationStrategy;
  baseUrl?: string;
  defaultModel?: string;
  maxTokens?: number;
  temperature?: number;
  /** Override type identity for custom-compatible providers (e.g. 'deepseek', 'groq') */
  providerType?: AIProviderType;
  /** Override display name for custom-compatible providers */
  providerName?: string;
  /** v0.4.9 A5: Azure OpenAI API version (e.g. '2024-06-01'). */
  apiVersion?: string;
}

// --- MCP Config ---
export interface MCPServerEntry {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  transport: 'stdio' | 'sse';
  env?: Record<string, string>;
  enabled: boolean;
}

// --- Orchestrator ---
export interface OrchestratorConfig {
  providers: ProviderConfig[];
  defaultProvider?: AIProviderType;
  fallbackOrder?: AIProviderType[];
  retryAttempts?: number;
  retryDelayMs?: number;
  routing?: {
    Explore?: string;
    Plan?: string;
    UI?: string;
    default?: string;
    [key: string]: string | undefined;
  };
  mcpServers?: MCPServerEntry[];
  costLimitUsd?: number;
  qdrantUrl?: string;
  collectionName?: string;
  cacheThreshold?: number;
  
  smartRouting?: {
    strategy: 'cost-first' | 'quality-first' | 'balanced' | 'latency-first';
    maxCostPerRequest?: number;
    maxLatencyMs?: number;
    minQualityScore?: number;
  };
}

export interface OrchestratorStatus {
  availableProviders: AIProviderType[];
  defaultProvider: AIProviderType | null;
  totalProviders: number;
  readyProviders: number;
}

// --- Embedding Types ---
export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  provider: AIProviderType;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingManyResponse {
  embeddings: number[][];
  model: string;
  provider: AIProviderType;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}
