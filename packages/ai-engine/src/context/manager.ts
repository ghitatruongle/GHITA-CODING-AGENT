// ==============================================================================
// GHITA CODING AGENT - Context Window Manager
// ==============================================================================

import type { ChatMessage } from '../types.js';
import { TrajectoryCompressor } from './compressor.js';

export interface ContextConfig {
  maxTokens: number;
  compactThreshold: number; // 0.0 - 1.0, e.g. 0.8 = compact at 80%
  strategy: 'sliding_window' | 'summary' | 'trajectory';
}

const DEFAULT_CONFIG: ContextConfig = {
  maxTokens: 128000,
  compactThreshold: 0.8,
  strategy: 'trajectory', // Default to trajectory compression in Phase 2
};

export class ContextManager {
  private config: ContextConfig;
  private compressor: TrajectoryCompressor;

  constructor(config?: Partial<ContextConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.compressor = new TrajectoryCompressor({
      maxTokens: this.config.maxTokens,
    });
  }


  /** Ước tính token count (rough: 1 token ≈ 4 chars tiếng Anh, 2 chars tiếng Việt) */
  estimateTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      // Rough estimation
      total += Math.ceil(msg.content.length / 3);
      total += 4; // overhead per message
    }
    return total;
  }

  /** Kiểm tra có cần compact không */
  needsCompact(messages: ChatMessage[]): boolean {
    const tokens = this.estimateTokens(messages);
    return tokens > this.config.maxTokens * this.config.compactThreshold;
  }

  /** Compact messages — sliding window strategy */
  compact(messages: ChatMessage[]): ChatMessage[] {
    if (!this.needsCompact(messages)) return messages;

    switch (this.config.strategy) {
      case 'trajectory':
        return this.compressor.compress(messages).messages;
      case 'summary':
        return this.compactWithSummary(messages);
      case 'sliding_window':
      default:
        return this.compactSlidingWindow(messages);
    }
  }

  /** Giữ lại messages gần nhất trong budget token */
  private compactSlidingWindow(messages: ChatMessage[]): ChatMessage[] {
    const budget = Math.floor(this.config.maxTokens * 0.6); // 60% cho messages cũ
    const result: ChatMessage[] = [];
    let tokens = 0;

    // Duyệt từ cuối lên đầu
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;
      const msgTokens = this.estimateTokens([msg]);
      if (tokens + msgTokens > budget && result.length > 0) break;
      result.unshift(msg);
      tokens += msgTokens;
    }

    // Thêm system summary ở đầu nếu đã cắt bớt
    if (result.length < messages.length) {
      result.unshift({
        role: 'system',
        content: `[Context compacted: ${messages.length - result.length} older messages removed to stay within token budget]`,
      });
    }

    return result;
  }

  /** Compact bằng cách tóm tắt (placeholder — cần AI call) */
  private compactWithSummary(messages: ChatMessage[]): ChatMessage[] {
    // Fallback to sliding window for now
    return this.compactSlidingWindow(messages);
  }

  /** Lấy usage info */
  getUsage(messages: ChatMessage[]): { used: number; max: number; percentage: number } {
    const used = this.estimateTokens(messages);
    return {
      used,
      max: this.config.maxTokens,
      percentage: Math.round((used / this.config.maxTokens) * 100),
    };
  }

  /** Cập nhật config */
  updateConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Lấy config hiện tại */
  getConfig(): ContextConfig {
    return { ...this.config };
  }
}
