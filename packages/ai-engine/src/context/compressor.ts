// ==============================================================================
// GHITA CODING AGENT - Trajectory Compressor
// ==============================================================================
// Nén lịch sử hội thoại thông minh — giữ lại decisions & outcomes,
// loại bỏ chi tiết không cần thiết. Tham khảo Hermes Agent trajectory_compressor.py.
// ==============================================================================

import type { ChatMessage } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mức độ quan trọng của một message trong trajectory */
export type MessageImportance = 'critical' | 'high' | 'medium' | 'low' | 'noise';

/** Kết quả phân tích một message */
export interface MessageAnalysis {
  message: ChatMessage;
  importance: MessageImportance;
  reason: string;
  /** true nếu message chứa quyết định hoặc outcome quan trọng */
  isDecision: boolean;
  /** true nếu message chứa lỗi hoặc exception */
  isError: boolean;
  /** Token count ước tính */
  estimatedTokens: number;
}

/** Kết quả compression */
export interface CompressionResult {
  /** Messages đã nén */
  messages: ChatMessage[];
  /** Số messages gốc */
  originalCount: number;
  /** Số messages sau nén */
  compressedCount: number;
  /** Token count ước tính trước nén */
  originalTokens: number;
  /** Token count ước tính sau nén */
  compressedTokens: number;
  /** Tỷ lệ nén (0-1, thấp hơn = nén nhiều hơn) */
  compressionRatio: number;
}

/** Cấu hình compressor */
export interface CompressorConfig {
  /** Ngưỡng token tối đa (default 128000) */
  maxTokens: number;
  /** Tỷ lệ % token mục tiêu sau nén (default 0.5 = 50% of max) */
  targetRatio: number;
  /** Số messages cuối luôn giữ nguyên, không nén (default 10) */
  preserveRecentCount: number;
  /** Luôn giữ system messages (default true) */
  preserveSystemMessages: boolean;
  /** Patterns regex để phát hiện decisions (default: list chuẩn) */
  decisionPatterns: RegExp[];
  /** Patterns regex để phát hiện errors (default: list chuẩn) */
  errorPatterns: RegExp[];
}

// ---------------------------------------------------------------------------
// Default Patterns
// ---------------------------------------------------------------------------

const DEFAULT_DECISION_PATTERNS: RegExp[] = [
  // English
  /\b(?:decided|decision|chose|chosen|selected|will use|going with|approved|confirmed)\b/i,
  /\b(?:the plan is|the approach|strategy is|solution is|fix is|answer is)\b/i,
  /\b(?:let's go with|I'll|we should|must|need to|should)\b/i,
  /\b(?:created|implemented|deployed|completed|finished|resolved)\b/i,
  // Vietnamese
  /(?:quyết định|đã chọn|sẽ dùng|phương án|giải pháp|hoàn thành|đã sửa|kết quả)/i,
  /(?:tạo mới|đã tạo|đã thêm|đã xóa|đã cập nhật|đã hoàn thành)/i,
];

const DEFAULT_ERROR_PATTERNS: RegExp[] = [
  /\b(?:error|exception|failed|failure|crash|bug|broken|issue)\b/i,
  /\b(?:TypeError|SyntaxError|ReferenceError|RangeError|URIError)\b/i,
  /\b(?:ENOENT|EACCES|EPERM|ECONNREFUSED|ETIMEDOUT)\b/i,
  /\b(?:404|500|502|503)\b/,
  /(?:lỗi|thất bại|không thành công|hỏng|sai|crash)/i,
  /```[\s\S]*?(?:error|Error|ERROR|failed|FAILED)[\s\S]*?```/,
];

// ---------------------------------------------------------------------------
// TrajectoryCompressor
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: CompressorConfig = {
  maxTokens: 128000,
  targetRatio: 0.5,
  preserveRecentCount: 10,
  preserveSystemMessages: true,
  decisionPatterns: DEFAULT_DECISION_PATTERNS,
  errorPatterns: DEFAULT_ERROR_PATTERNS,
};

export class TrajectoryCompressor {
  private readonly config: CompressorConfig;

  constructor(config?: Partial<CompressorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Nén trajectory bằng rule-based heuristics (không cần LLM).
   * Multi-pass compression:
   *   Pass 1: Phân tích importance mỗi message
   *   Pass 2: Nhóm và tóm tắt messages ít quan trọng
   *   Pass 3: Ghép lại thành trajectory nén
   */
  compress(messages: ChatMessage[]): CompressionResult {
    const originalTokens = this.estimateTokensTotal(messages);

    // Nếu chưa cần nén, trả nguyên
    const targetTokens = Math.floor(this.config.maxTokens * this.config.targetRatio);
    if (originalTokens <= targetTokens) {
      return {
        messages,
        originalCount: messages.length,
        compressedCount: messages.length,
        originalTokens,
        compressedTokens: originalTokens,
        compressionRatio: 1,
      };
    }

    // Pass 1: Phân tích importance
    const analyses = this.analyzeMessages(messages);

    // Pass 2: Quyết định giữ/nén
    const compressedMessages = this.applyCompression(analyses, targetTokens);

    const compressedTokens = this.estimateTokensTotal(compressedMessages);
    return {
      messages: compressedMessages,
      originalCount: messages.length,
      compressedCount: compressedMessages.length,
      originalTokens,
      compressedTokens,
      compressionRatio: messages.length > 0 ? compressedMessages.length / messages.length : 1,
    };
  }

  /**
   * Nén trajectory bằng LLM (async — gọi LLM để tóm tắt).
   * Cần truyền một hàm summarizer.
   */
  async compressAsync(
    messages: ChatMessage[],
    summarizer: (messagesToSummarize: ChatMessage[]) => Promise<string>,
  ): Promise<CompressionResult> {
    const originalTokens = this.estimateTokensTotal(messages);
    const targetTokens = Math.floor(this.config.maxTokens * this.config.targetRatio);

    if (originalTokens <= targetTokens) {
      return {
        messages,
        originalCount: messages.length,
        compressedCount: messages.length,
        originalTokens,
        compressedTokens: originalTokens,
        compressionRatio: 1,
      };
    }

    // Pass 1: Phân tích importance (not needed for simple LLM slice, keeping rule-based fallbacks)

    // Chia messages thành 2 phần: cũ (nén) và mới (giữ)
    const preserveCount = Math.min(this.config.preserveRecentCount, messages.length);
    const oldMessages = messages.slice(0, messages.length - preserveCount);
    const recentMessages = messages.slice(messages.length - preserveCount);

    // Nếu phần cũ đủ nhỏ, chỉ dùng rule-based
    if (this.estimateTokensTotal(oldMessages) < targetTokens * 0.3) {
      return this.compress(messages);
    }

    // Gọi LLM summarize phần cũ
    try {
      const summary = await summarizer(oldMessages);
      const summaryMessage: ChatMessage = {
        role: 'system',
        content: `[Trajectory Summary — ${oldMessages.length} messages compressed]\n\n${summary}`,
      };

      const compressedMessages = [summaryMessage, ...recentMessages];
      const compressedTokens = this.estimateTokensTotal(compressedMessages);

      return {
        messages: compressedMessages,
        originalCount: messages.length,
        compressedCount: compressedMessages.length,
        originalTokens,
        compressedTokens,
        compressionRatio: compressedMessages.length / messages.length,
      };
    } catch {
      // Fallback to rule-based compression
      return this.compress(messages);
    }
  }

  /**
   * Phân tích importance của mỗi message.
   */
  analyzeMessages(messages: ChatMessage[]): MessageAnalysis[] {
    return messages.map((msg, index) => {
      const isLast = index >= messages.length - this.config.preserveRecentCount;
      const isSystem = msg.role === 'system';
      const isDecision = this.matchesPatterns(msg.content, this.config.decisionPatterns);
      const isError = this.matchesPatterns(msg.content, this.config.errorPatterns);
      const estimatedTokens = this.estimateTokensSingle(msg);

      let importance: MessageImportance;
      let reason: string;

      if (isLast) {
        importance = 'critical';
        reason = 'Recent message — always preserved';
      } else if (isSystem && this.config.preserveSystemMessages) {
        importance = 'critical';
        reason = 'System message — always preserved';
      } else if (isError) {
        importance = 'high';
        reason = 'Contains error/exception information';
      } else if (isDecision) {
        importance = 'high';
        reason = 'Contains decision or outcome';
      } else if (msg.content.length > 2000) {
        // Long messages are likely tool outputs — lower importance
        importance = 'low';
        reason = 'Long content — likely verbose tool output';
      } else if (msg.content.length < 30) {
        importance = 'low';
        reason = 'Very short message — likely acknowledgment';
      } else if (msg.role === 'user') {
        importance = 'medium';
        reason = 'User message';
      } else {
        importance = 'medium';
        reason = 'Assistant response';
      }

      return { message: msg, importance, reason, isDecision, isError, estimatedTokens };
    });
  }

  /**
   * Lấy cấu hình hiện tại.
   */
  getConfig(): CompressorConfig {
    return { ...this.config };
  }

  /**
   * Cập nhật cấu hình.
   */
  updateConfig(config: Partial<CompressorConfig>): void {
    Object.assign(this.config, config);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Áp dụng compression dựa trên analyses.
   * Giữ critical/high, nhóm và tóm tắt medium/low/noise.
   */
  private applyCompression(analyses: MessageAnalysis[], targetTokens: number): ChatMessage[] {
    const result: ChatMessage[] = [];
    let currentTokens = 0;
    let pendingGroup: MessageAnalysis[] = [];

    for (const analysis of analyses) {
      if (analysis.importance === 'critical' || analysis.importance === 'high') {
        // Flush pending group trước
        if (pendingGroup.length > 0) {
          const summary = this.summarizeGroup(pendingGroup);
          const summaryTokens = this.estimateTokensSingle(summary);
          if (currentTokens + summaryTokens <= targetTokens) {
            result.push(summary);
            currentTokens += summaryTokens;
          }
          pendingGroup = [];
        }

        // Giữ message quan trọng
        if (currentTokens + analysis.estimatedTokens <= targetTokens) {
          result.push(analysis.message);
          currentTokens += analysis.estimatedTokens;
        } else {
          // Nếu over budget, truncate message
          const truncated = this.truncateMessage(analysis.message, targetTokens - currentTokens);
          result.push(truncated);
          currentTokens = targetTokens;
        }
      } else {
        // medium/low/noise → nhóm lại để tóm tắt
        pendingGroup.push(analysis);
      }
    }

    // Flush remaining group
    if (pendingGroup.length > 0) {
      const summary = this.summarizeGroup(pendingGroup);
      result.push(summary);
    }

    return result;
  }

  /**
   * Tóm tắt một nhóm messages ít quan trọng thành 1 message.
   */
  private summarizeGroup(group: MessageAnalysis[]): ChatMessage {
    if (group.length === 1) {
      const first = group[0];
      if (!first) return { role: 'system', content: '[Compressed] Empty group' };
      const msg = first.message;
      return {
        role: 'system',
        content: `[Compressed] ${msg.role}: ${this.extractSummary(msg.content)}`,
      };
    }

    const roleCount: Record<string, number> = {};
    const keyPoints: string[] = [];

    for (const analysis of group) {
      const role = analysis.message.role;
      roleCount[role] = (roleCount[role] ?? 0) + 1;

      if (analysis.isDecision || analysis.isError) {
        keyPoints.push(this.extractSummary(analysis.message.content));
      }
    }

    const roleSummary = Object.entries(roleCount)
      .map(([role, count]) => `${count} ${role}`)
      .join(', ');

    let content = `[Compressed ${group.length} messages: ${roleSummary}]`;
    if (keyPoints.length > 0) {
      content += `\nKey points: ${keyPoints.join('; ')}`;
    }

    return { role: 'system', content };
  }

  /**
   * Trích xuất summary ngắn gọn từ content dài.
   */
  private extractSummary(content: string, maxLength = 150): string {
    // Loại bỏ code blocks
    let cleaned = content.replace(/```[\s\S]*?```/g, '[code]');
    // Loại bỏ multiple newlines
    cleaned = cleaned.replace(/\n{2,}/g, '\n');
    // Loại bỏ leading whitespace
    cleaned = cleaned.trim();

    if (cleaned.length <= maxLength) return cleaned;

    // Cắt tại câu gần nhất
    const truncated = cleaned.slice(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?'),
      truncated.lastIndexOf('\n'),
    );

    if (lastSentenceEnd > maxLength * 0.5) {
      return `${truncated.slice(0, lastSentenceEnd + 1)  }...`;
    }

    return `${truncated  }...`;
  }

  /**
   * Truncate một message để fit trong token budget.
   */
  private truncateMessage(message: ChatMessage, maxTokens: number): ChatMessage {
    const maxChars = Math.max(100, maxTokens * 3); // rough: 1 token ≈ 3 chars
    if (message.content.length <= maxChars) return message;

    return {
      role: message.role,
      content: `${message.content.slice(0, maxChars)  }\n[... truncated ...]`,
    };
  }

  /**
   * Kiểm tra content có match bất kỳ pattern nào không.
   */
  private matchesPatterns(content: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(content));
  }

  /**
   * Ước tính token count cho 1 message.
   */
  private estimateTokensSingle(message: ChatMessage): number {
    return Math.ceil(message.content.length / 3) + 4;
  }

  /**
   * Ước tính tổng token count.
   */
  private estimateTokensTotal(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.estimateTokensSingle(msg);
    }
    return total;
  }
}
