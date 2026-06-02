// ==============================================================================
// GHITA CODING AGENT - Token Counter Utility
// Phase 3.2: Estimate and count tokens for context management
// ==============================================================================

import type { ChatMessage } from '../types.js';

/** Rough chars-per-token ratios by model family */
const CHARS_PER_TOKEN: Record<string, number> = {
  'gpt-4': 3.5,
  'gpt-3.5': 4,
  'claude': 3.5,
  'gemini': 4,
  'llama': 4,
  'mistral': 4,
  'default': 4,
};

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
 * More accurate than word-based; within ~10% of tiktoken for English.
 */
export function estimateTokens(text: string, model?: string): number {
  if (!text) return 0;
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
  model?: string
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
  model?: string
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
  model?: string
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
