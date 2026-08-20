import type { ChatMessage } from '../types.js';

/** Rough chars-per-token ratios by model family */
const CHARS_PER_TOKEN: Record<string, number> = {
  'gpt-4': 3.5,
  'gpt-3.5': 4,
  claude: 3.5,
  gemini: 4,
  llama: 4,
  mistral: 4,
  default: 4,
};

// v1.1.5-beta1 Track 4.1: Native tokenizer bridge (tiktoken-rs via napi)
interface TokenizerNative {
  countTokensJs(text: string, family?: string): number;
  countMessagesTokensJs(
    messages: Array<{ role: string; content: string }>,
    family?: string,
  ): number;
  detectEncodingFamily(model: string): string;
}

let _tokenizerBridge: { native: boolean; impl: TokenizerNative } | null = null;
function getTokenizerBridge() {
  if (_tokenizerBridge === null) {
    try {
      const req = typeof require !== 'undefined' ? require : null;
      if (req) {
        const mod = req('@ghita/native-bridge') as {
          loadNative?: (
            name: string,
            fallback: unknown,
          ) => { native: boolean; impl: TokenizerNative };
        };
        if (mod.loadNative) {
          _tokenizerBridge = mod.loadNative('tokenizer', undefined);
        }
      }
    } catch {
      // Fall through to JS fallback
    }
    if (_tokenizerBridge === null) {
      _tokenizerBridge = { native: false, impl: undefined as unknown as TokenizerNative };
    }
  }
  return _tokenizerBridge;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ContextWindow {
  maxTokens: number;
  usedTokens: number;
  remainingTokens: number;
  usagePercent: number;
}

/**
 * Estimate token count from text using character-based heuristic.
 * More accurate than word-based; within ~10 percent of tiktoken for English.
 */
export function estimateTokens(text: string, model?: string): number {
  if (!text) return 0;
  // v1.1.5-beta1 T4.1: use native BPE when available
  const bridge = getTokenizerBridge();
  if (bridge && bridge.native && typeof bridge.impl?.countTokensJs === 'function') {
    try {
      const family = bridge.impl.detectEncodingFamily(model ?? '');
      return bridge.impl.countTokensJs(text, family);
    } catch {
      /* fall through to heuristic */
    }
  }
  const ratio = getModelRatio(model);
  return Math.ceil(text.length / ratio);
}

/**
 * Estimate total tokens for a list of messages (including role overhead).
 */
export function estimateMessagesTokens(messages: ChatMessage[], model?: string): number {
  let total = 0;
  for (const msg of messages) {
    // Each message has ~4 tokens overhead (role, formatting)
    total += 4;
    total += estimateTokens(msg.content ?? '', model);
  }
  // Add reply priming tokens
  total += 2;
  return total;
}

/**
 * Check if messages fit within a context window.
 */
export function fitsInContext(
  messages: ChatMessage[],
  maxContextTokens: number,
  reservedOutputTokens = 1024,
  model?: string,
): { fits: boolean; estimatedTokens: number; available: number } {
  const estimatedTokens = estimateMessagesTokens(messages, model);
  const available = maxContextTokens - reservedOutputTokens;
  return {
    fits: estimatedTokens <= available,
    estimatedTokens,
    available,
  };
}

/**
 * Truncate messages to fit within context window, keeping system + recent messages.
 */
export function truncateToFit(
  messages: ChatMessage[],
  maxContextTokens: number,
  reservedOutputTokens = 1024,
  model?: string,
): ChatMessage[] {
  const available = maxContextTokens - reservedOutputTokens;
  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  // Always keep system messages
  const systemTokens = estimateMessagesTokens(systemMessages, model);
  let remaining = available - systemTokens;

  if (remaining <= 0) return systemMessages;

  // Keep messages from the end (most recent first)
  const kept: ChatMessage[] = [];
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msg = nonSystemMessages[i];
    if (!msg) break;
    const msgTokens = 4 + estimateTokens(msg.content ?? '', model);
    if (msgTokens > remaining) break;
    kept.unshift(msg);
    remaining -= msgTokens;
  }

  return [...systemMessages, ...kept];
}

/**
 * Get context window info for display.
 */
export function getContextInfo(
  messages: ChatMessage[],
  maxContextTokens: number,
  model?: string,
): ContextWindow {
  const usedTokens = estimateMessagesTokens(messages, model);
  return {
    maxTokens: maxContextTokens,
    usedTokens,
    remainingTokens: Math.max(0, maxContextTokens - usedTokens),
    usagePercent: Math.min(100, (usedTokens / maxContextTokens) * 100),
  };
}

function getModelRatio(model?: string): number {
  if (!model) return CHARS_PER_TOKEN['default'] ?? 4;
  const lower = model.toLowerCase();
  for (const [key, ratio] of Object.entries(CHARS_PER_TOKEN)) {
    if (lower.includes(key)) return ratio;
  }
  return CHARS_PER_TOKEN['default'] ?? 4;
}
