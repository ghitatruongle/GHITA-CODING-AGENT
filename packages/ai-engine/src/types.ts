// ==============================================================================
// GHITA CODING AGENT - AI Engine Types
// ==============================================================================

import type { AIProviderType, AIStreamChunk } from '@ghita/shared';

// --- Provider Interface ---
export interface AIProvider {
  readonly type: AIProviderType;
  readonly name: string;
  readonly defaultModel: string;
  readonly models: string[];

  /** Kiểm tra provider đã sẵn sàng chưa (có API key, kết nối được không) */
  isReady(): Promise<boolean>;

  /** Gửi message và nhận response (non-streaming) */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Gửi message và nhận streaming response */
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;

  /** Test kết nối provider */
  test(): Promise<boolean>;
}

// --- Chat Types ---
export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: AIProviderType;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'error' | 'aborted';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// --- Provider Config ---
export interface ProviderConfig {
  type: AIProviderType;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  maxTokens?: number;
  temperature?: number;
}

// --- Orchestrator ---
export interface OrchestratorConfig {
  providers: ProviderConfig[];
  defaultProvider?: AIProviderType;
  fallbackOrder?: AIProviderType[];
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface OrchestratorStatus {
  availableProviders: AIProviderType[];
  defaultProvider: AIProviderType | null;
  totalProviders: number;
  readyProviders: number;
}
