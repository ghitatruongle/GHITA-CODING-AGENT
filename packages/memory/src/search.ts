// ==============================================================================
// GHITA CODING AGENT - Cross-Session Memory Search
// ==============================================================================

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface SessionRecord {
  sessionId: string;
  startTime: number;
  endTime: number;
  messages: SessionMessage[];
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface CrossSessionResult {
  sessionId: string;
  matches: Array<{
    message: SessionMessage;
    score: number;
    context: string;
  }>;
  sessionSummary?: string;
  overallScore: number;
}

const TOKEN_PATTERN = /[\p{L}\p{N}_-]+/gu;

export class CrossSessionSearch {
  private readonly sessions = new Map<string, SessionRecord>();
  // Inverted index: map token -> set of sessionIds
  private readonly index = new Map<string, Set<string>>();
  private readonly maxSessions: number;

  constructor(maxSessions = 1000) {
    this.maxSessions = maxSessions;
  }

  /**
   * Đưa một session vào cơ sở dữ liệu in-memory inverted index
   */
  indexSession(session: SessionRecord): void {
    // Quản lý dung lượng bộ nhớ
    if (this.sessions.size >= this.maxSessions && !this.sessions.has(session.sessionId)) {
      const oldestId = [...this.sessions.values()]
        .sort((a, b) => a.startTime - b.startTime)[0]?.sessionId;
      if (oldestId) this.removeSession(oldestId);
    }

    this.sessions.set(session.sessionId, session);

    // Index all tokens in messages
    for (const msg of session.messages) {
      const tokens = this.tokenize(msg.content);
      for (const token of tokens) {
        let set = this.index.get(token);
        if (!set) {
          set = new Set<string>();
          this.index.set(token, set);
        }
        set.add(session.sessionId);
      }
    }

    // Index summary if available
    if (session.summary) {
      const tokens = this.tokenize(session.summary);
      for (const token of tokens) {
        let set = this.index.get(token);
        if (!set) {
          set = new Set<string>();
          this.index.set(token, set);
        }
        set.add(session.sessionId);
      }
    }
  }

  /**
   * Loại bỏ session khỏi index
   */
  removeSession(sessionId: string): boolean {
    const removed = this.sessions.delete(sessionId);
    if (!removed) return false;

    // PERFORMANCE NOTE: This iterates the entire inverted index (O(tokens)) to clean up.
    // For large indexes, consider maintaining a reverse map (sessionId -> tokens) for O(1) cleanup.
    // TODO: Refactor to use a reverse index map for O(1) session removal.
    for (const [token, set] of this.index.entries()) {
      set.delete(sessionId);
      if (set.size === 0) {
        this.index.delete(token);
      }
    }
    return true;
  }

  /**
   * Tìm kiếm các message liên quan xuyên suốt tất cả sessions đã lưu
   */
  searchAcrossSessions(
    query: string,
    options: { limit?: number; minScore?: number; sessionType?: string } = {}
  ): CrossSessionResult[] {
    const queryTokens = this.tokenize(query);
    const limit = options.limit ?? 5;
    const minScore = options.minScore ?? 0.1;
    
    if (queryTokens.size === 0) return [];

    // Tìm các session chứa ít nhất một token của query
    const candidateSessionIds = new Set<string>();
    for (const token of queryTokens) {
      const set = this.index.get(token);
      if (set) {
        for (const id of set) {
          candidateSessionIds.add(id);
        }
      }
    }

    const results: CrossSessionResult[] = [];

    for (const sessionId of candidateSessionIds) {
      const session = this.sessions.get(sessionId);
      if (!session) continue;
      
      // Lọc theo metadata type nếu được cung cấp
      if (options.sessionType && session.metadata?.type !== options.sessionType) {
        continue;
      }

      const matches: CrossSessionResult['matches'] = [];
      let maxMsgScore = 0;

      for (const msg of session.messages) {
        const msgTokens = this.tokenize(msg.content);
        if (msgTokens.size === 0) continue;

        let intersection = 0;
        for (const token of queryTokens) {
          if (msgTokens.has(token)) intersection++;
        }

        const score = intersection / queryTokens.size;
        if (score >= minScore) {
          // Trích xuất ngữ cảnh xung quanh từ khóa trùng khớp
          const context = this.extractContext(msg.content, queryTokens);
          matches.push({ message: msg, score, context });
          if (score > maxMsgScore) maxMsgScore = score;
        }
      }

      if (matches.length > 0) {
        // Điểm của session = điểm tối đa của message + 10% recency bonus
        const ageMs = Date.now() - session.endTime;
        const recencyBonus = Math.max(0, 0.1 * (1 - ageMs / (1000 * 60 * 60 * 24 * 30)));
        const overallScore = Math.min(1.0, maxMsgScore + recencyBonus);

        results.push({
          sessionId,
          matches: matches.sort((a, b) => b.score - a.score),
          sessionSummary: session.summary,
          overallScore,
        });
      }
    }

    return results
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, limit);
  }

  /**
   * Đếm tổng số session đã được index
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Tóm tắt các kết quả tìm kiếm thành chuỗi text đẹp mắt để chèn trực tiếp vào context
   */
  summarizeResults(results: CrossSessionResult[], maxChars = 2000): string {
    if (results.length === 0) return '';

    const lines = ['=== LỊCH SỬ PHIÊN HỘI THOẠI TRƯỚC ĐÓ ==='];
    
    for (const res of results) {
      lines.push(`\n[Phiên ID: ${res.sessionId}]`);
      if (res.sessionSummary) {
        lines.push(`Tóm tắt phiên: ${res.sessionSummary}`);
      }
      
      lines.push('Đoạn hội thoại liên quan:');
      for (const match of res.matches.slice(0, 2)) { // Lấy tối đa 2 matches liên quan nhất
        const roleName = match.message.role === 'user' ? 'Người dùng' : 'AI';
        lines.push(`  - ${roleName}: "${match.context}" (Độ trùng khớp: ${Math.round(match.score * 100)}%)`);
      }
    }

    const output = lines.join('\n');
    return output.length > maxChars ? output.slice(0, maxChars) + '...\n[Cắt bớt do quá dài]' : output;
  }

  /**
   * Xóa toàn bộ dữ liệu index
   */
  clear(): void {
    this.sessions.clear();
    this.index.clear();
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private tokenize(text: string): Set<string> {
    const matches = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
    return new Set(matches.filter(token => token.length > 1));
  }

  private extractContext(content: string, queryTokens: Set<string>, windowChars = 100): string {
    const contentLower = content.toLowerCase();
    let bestIndex = 0;
    let maxMatches = 0;

    // Tìm vị trí đắc địa nhất chứa nhiều keyword trùng khớp nhất
    for (let i = 0; i < content.length; i += 20) {
      const slice = contentLower.slice(i, i + windowChars);
      let matches = 0;
      for (const token of queryTokens) {
        if (slice.includes(token)) matches++;
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        bestIndex = i;
      }
    }

    const start = Math.max(0, bestIndex - 20);
    const end = Math.min(content.length, bestIndex + windowChars + 20);
    
    let snippet = content.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet.trim().replace(/\s+/g, ' ');
  }
}
