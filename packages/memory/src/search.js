// ==============================================================================
// GHITA CODING AGENT - Cross-Session Memory Search
// ==============================================================================
const TOKEN_PATTERN = /[\p{L}\p{N}_-]+/gu;
export class CrossSessionSearch {
    sessions = new Map();
    // Inverted index: map token -> set of sessionIds
    index = new Map();
    maxSessions;
    constructor(maxSessions = 1000) {
        this.maxSessions = maxSessions;
    }
    /**
     * Đưa một session vào cơ sở dữ liệu in-memory inverted index
     */
    indexSession(session) {
        // Quản lý dung lượng bộ nhớ
        if (this.sessions.size >= this.maxSessions && !this.sessions.has(session.sessionId)) {
            const oldestId = [...this.sessions.values()]
                .sort((a, b) => a.startTime - b.startTime)[0]?.sessionId;
            if (oldestId)
                this.removeSession(oldestId);
        }
        this.sessions.set(session.sessionId, session);
        // Index all tokens in messages
        for (const msg of session.messages) {
            const tokens = this.tokenize(msg.content);
            for (const token of tokens) {
                let set = this.index.get(token);
                if (!set) {
                    set = new Set();
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
                    set = new Set();
                    this.index.set(token, set);
                }
                set.add(session.sessionId);
            }
        }
    }
    /**
     * Loại bỏ session khỏi index
     */
    removeSession(sessionId) {
        const removed = this.sessions.delete(sessionId);
        if (!removed)
            return false;
        // Clean up inverted index
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
    searchAcrossSessions(query, options = {}) {
        const queryTokens = this.tokenize(query);
        const limit = options.limit ?? 5;
        const minScore = options.minScore ?? 0.1;
        if (queryTokens.size === 0)
            return [];
        // Tìm các session chứa ít nhất một token của query
        const candidateSessionIds = new Set();
        for (const token of queryTokens) {
            const set = this.index.get(token);
            if (set) {
                for (const id of set) {
                    candidateSessionIds.add(id);
                }
            }
        }
        const results = [];
        for (const sessionId of candidateSessionIds) {
            const session = this.sessions.get(sessionId);
            // Lọc theo metadata type nếu được cung cấp
            if (options.sessionType && session.metadata?.type !== options.sessionType) {
                continue;
            }
            const matches = [];
            let maxMsgScore = 0;
            for (const msg of session.messages) {
                const msgTokens = this.tokenize(msg.content);
                if (msgTokens.size === 0)
                    continue;
                let intersection = 0;
                for (const token of queryTokens) {
                    if (msgTokens.has(token))
                        intersection++;
                }
                const score = intersection / queryTokens.size;
                if (score >= minScore) {
                    // Trích xuất ngữ cảnh xung quanh từ khóa trùng khớp
                    const context = this.extractContext(msg.content, queryTokens);
                    matches.push({ message: msg, score, context });
                    if (score > maxMsgScore)
                        maxMsgScore = score;
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
    getSessionCount() {
        return this.sessions.size;
    }
    /**
     * Tóm tắt các kết quả tìm kiếm thành chuỗi text đẹp mắt để chèn trực tiếp vào context
     */
    summarizeResults(results, maxChars = 2000) {
        if (results.length === 0)
            return '';
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
    clear() {
        this.sessions.clear();
        this.index.clear();
    }
    // =========================================================================
    // Private Helpers
    // =========================================================================
    tokenize(text) {
        const matches = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
        return new Set(matches.filter(token => token.length > 1));
    }
    extractContext(content, queryTokens, windowChars = 100) {
        const contentLower = content.toLowerCase();
        let bestIndex = 0;
        let maxMatches = 0;
        // Tìm vị trí đắc địa nhất chứa nhiều keyword trùng khớp nhất
        for (let i = 0; i < content.length; i += 20) {
            const slice = contentLower.slice(i, i + windowChars);
            let matches = 0;
            for (const token of queryTokens) {
                if (slice.includes(token))
                    matches++;
            }
            if (matches > maxMatches) {
                maxMatches = matches;
                bestIndex = i;
            }
        }
        const start = Math.max(0, bestIndex - 20);
        const end = Math.min(content.length, bestIndex + windowChars + 20);
        let snippet = content.slice(start, end);
        if (start > 0)
            snippet = '...' + snippet;
        if (end < content.length)
            snippet = snippet + '...';
        return snippet.trim().replace(/\s+/g, ' ');
    }
}
//# sourceMappingURL=search.js.map