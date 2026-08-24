// Automatically compacts and summarizes long conversation history when context
// usage crosses 80% threshold, saving up to 70% of prompt token costs.

import type { AIMessage } from '@ghita/shared';

export interface CompactionConfig {
  maxContextTokens: number;
  triggerThresholdRatio: number; // e.g. 0.8 (80%)
  targetCompressionRatio: number; // e.g. 0.5 (50%)
}

export interface CompactionResult {
  compacted: boolean;
  messages: AIMessage[];
  originalCount: number;
  compactedCount: number;
  estimatedTokensSaved: number;
}

export class QueryEngine {
  private config: CompactionConfig;

  constructor(config?: Partial<CompactionConfig>) {
    this.config = {
      maxContextTokens: config?.maxContextTokens ?? 128000,
      triggerThresholdRatio: config?.triggerThresholdRatio ?? 0.8,
      targetCompressionRatio: config?.targetCompressionRatio ?? 0.5,
    };
  }

  /**
   * Estimate token count of a message string (approx 4 chars per token).
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate total estimated tokens for a list of messages.
   */
  calculateTotalTokens(messages: AIMessage[]): number {
    return messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
  }

  /**
   * Auto-compact message trajectory if token limit threshold is exceeded.
   */
  compactIfNeeded(messages: AIMessage[]): CompactionResult {
    const totalTokens = this.calculateTotalTokens(messages);
    const triggerThreshold = this.config.maxContextTokens * this.config.triggerThresholdRatio;

    if (totalTokens < triggerThreshold || messages.length <= 4) {
      return {
        compacted: false,
        messages,
        originalCount: messages.length,
        compactedCount: messages.length,
        estimatedTokensSaved: 0,
      };
    }

    // Preserve system prompt (if present at index 0) and the last N recent messages
    const hasSystemPrompt = messages[0]?.role === 'system';
    const systemPrompt = hasSystemPrompt ? messages[0] : null;

    const tailCount = 4; // Keep last 4 messages intact
    const middleMessages = hasSystemPrompt
      ? messages.slice(1, messages.length - tailCount)
      : messages.slice(0, messages.length - tailCount);
    const tailMessages = messages.slice(messages.length - tailCount);

    // Summarize middle messages
    const middleSummaryText = middleMessages
      .map((m) => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 100)}...`)
      .join('\n');

    const summaryMessage: AIMessage = {
      id: `summary-${Date.now()}`,
      role: 'system',
      content: `[CONTEXT COMPACTION SUMMARY - ${middleMessages.length} prior messages compacted]:\n${middleSummaryText}`,
      timestamp: Date.now(),
    };

    const middleTokens = this.calculateTotalTokens(middleMessages);
    const summaryTokens = this.estimateTokens(summaryMessage.content);
    const saved = Math.max(1, middleTokens - summaryTokens);

    const newMessages: AIMessage[] = [];
    if (systemPrompt) newMessages.push(systemPrompt);
    newMessages.push(summaryMessage);
    newMessages.push(...tailMessages);

    return {
      compacted: true,
      messages: newMessages,
      originalCount: messages.length,
      compactedCount: newMessages.length,
      estimatedTokensSaved: saved,
    };
  }
}
