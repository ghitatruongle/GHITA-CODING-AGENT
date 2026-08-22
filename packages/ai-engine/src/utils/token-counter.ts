import { createRequire } from 'node:module';
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

// v1.1.5-beta2 Track 1.4: Native tokenizer bridge (tiktoken-rs via napi)
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
      const requireAt = createRequire(import.meta.url);
      const mod = requireAt('@ghita/native-bridge') as {
        loadNative?: (
          name: string,
          fallback: unknown,
        ) => { native: boolean; impl: TokenizerNative };
      };
      if (mod.loadNative) {
        _tokenizerBridge = mod.loadNative('tokenizer', undefined);
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
 * Estimate token count from text using character-based heuristic or native BPE.
 */
export function estimateTokens(text: string, model?: string): number {
  if (!text) return 0;
  // v1.1.5-beta2 T1.4: use native BPE when available
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
  const bridge = getTokenizerBridge();
  if (bridge && bridge.native && typeof bridge.impl?.countMessagesTokensJs === 'function') {
    try {
      const family = bridge.impl.detectEncodingFamily(model ?? '');
      const pairs = messages.map((m) => ({ role: m.role || 'user', content: m.content || '' }));
      return bridge.impl.countMessagesTokensJs(pairs, family);
    } catch {
      /* fall through to heuristic */
    }
  }

  for (const msg of messages) {
    total += 4;
    total += estimateTokens(msg.content ?? '', model);
  }
  total += 2;
  return total;
}

/**
 * Check if messages fit within a context window.
 */
export function fitsContextWindow(
  messages: ChatMessage[],
  maxTokens: number,
  reservedForCompletion = 1000,
  model?: string,
): { fits: boolean; usedTokens: number; remainingTokens: number } {
  const usedTokens = estimateMessagesTokens(messages, model);
  const remainingTokens = maxTokens - usedTokens - reservedForCompletion;
  return {
    fits: remainingTokens >= 0,
    usedTokens,
    remainingTokens: Math.max(0, remainingTokens),
  };
}

/**
 * Alias for fitsContextWindow with available field.
 */
export function fitsInContext(
  messages: ChatMessage[],
  maxTokens: number,
  reservedForCompletion = 0,
  model?: string,
): { fits: boolean; available: number; used: number } {
  const used = estimateMessagesTokens(messages, model);
  const available = maxTokens - used - reservedForCompletion;
  return {
    fits: available >= 0,
    available: Math.max(0, available),
    used,
  };
}

/**
 * Calculate token usage statistics for a context window.
 */
export function getContextWindow(
  messages: ChatMessage[],
  maxTokens: number,
  model?: string,
): ContextWindow {
  const usedTokens = estimateMessagesTokens(messages, model);
  const remainingTokens = Math.max(0, maxTokens - usedTokens);
  const usagePercent = Math.min(100, Math.round((usedTokens / maxTokens) * 100));

  return {
    maxTokens,
    usedTokens,
    remainingTokens,
    usagePercent,
  };
}

/**
 * Alias for getContextWindow.
 */
export function getContextInfo(
  messages: ChatMessage[],
  maxTokens: number,
  model?: string,
): ContextWindow {
  return getContextWindow(messages, maxTokens, model);
}

/**
 * Truncate message history to fit within a token limit, prioritizing keeping system messages and newest turns.
 */
export function truncateToFit(
  messages: ChatMessage[],
  maxTokens: number,
  model?: string,
): ChatMessage[] {
  if (messages.length === 0) return [];
  const system = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');

  let currentTokens = estimateMessagesTokens(system, model);
  if (currentTokens > maxTokens) {
    return system.slice(0, 1);
  }

  const kept: ChatMessage[] = [];
  for (let i = nonSystem.length - 1; i >= 0; i--) {
    const msg = nonSystem[i];
    if (!msg) continue;
    const msgTokens = estimateTokens(msg.content ?? '', model) + 4;
    if (currentTokens + msgTokens <= maxTokens) {
      kept.unshift(msg);
      currentTokens += msgTokens;
    } else {
      break;
    }
  }

  return [...system, ...kept];
}

/**
 * Truncate text to approximately fit within a token limit.
 */
export function truncateToTokenLimit(
  text: string,
  maxTokens: number,
  model?: string,
): { text: string; truncated: boolean; estimatedTokens: number } {
  const currentTokens = estimateTokens(text, model);
  if (currentTokens <= maxTokens) {
    return { text, truncated: false, estimatedTokens: currentTokens };
  }

  const ratio = getModelRatio(model);
  const maxChars = Math.floor(maxTokens * ratio);
  const truncatedText = `${text.slice(0, maxChars)}...`;

  return {
    text: truncatedText,
    truncated: true,
    estimatedTokens: estimateTokens(truncatedText, model),
  };
}

/**
 * Split text into chunks that each fit within a maximum token limit.
 * Tries to split on sentence/paragraph boundaries where possible.
 */
export function chunkByTokens(
  text: string,
  maxTokensPerChunk: number,
  overlapTokens = 50,
  model?: string,
): string[] {
  if (!text) return [];

  const ratio = getModelRatio(model);
  const maxChars = Math.floor(maxTokensPerChunk * ratio);
  const overlapChars = Math.floor(overlapTokens * ratio);

  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChars;

    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }

    const lookbackStart = Math.max(start, end - Math.floor(maxChars * 0.2));
    const slice = text.slice(lookbackStart, end);

    let splitIndex = slice.lastIndexOf('\n\n');
    if (splitIndex !== -1) {
      end = lookbackStart + splitIndex + 2;
    } else {
      splitIndex = slice.lastIndexOf('\n');
      if (splitIndex !== -1) {
        end = lookbackStart + splitIndex + 1;
      } else {
        const sentenceMatch = slice.match(/[.!?]\s+(?=[A-Z])/);
        if (sentenceMatch && sentenceMatch.index !== undefined) {
          end = lookbackStart + sentenceMatch.index + 2;
        } else {
          splitIndex = slice.lastIndexOf(' ');
          if (splitIndex !== -1) {
            end = lookbackStart + splitIndex + 1;
          }
        }
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = Math.max(start + 1, end - overlapChars);
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Get the chars-per-token ratio for a given model family.
 */
function getModelRatio(model?: string): number {
  if (!model) return CHARS_PER_TOKEN['default'] ?? 4;
  const lower = model.toLowerCase();

  for (const [key, ratio] of Object.entries(CHARS_PER_TOKEN)) {
    if (key !== 'default' && lower.includes(key)) {
      return ratio ?? 4;
    }
  }

  return CHARS_PER_TOKEN['default'] ?? 4;
}
