// ==============================================================================
// GHITA CODING AGENT - Agent SDK Client
// ==============================================================================
/**
 * GhitAgentClient — SDK cho developer xây dựng custom agents trên nền GHITA
 *
 * @example
 * ```ts
 * const client = new GhitAgentClient({ serverUrl: 'http://localhost:8080' });
 * const response = await client.sendMessage('Hello GHITA!');
 * console.log(response.content);
 * ```
 */
export class GhitAgentClient {
    config;
    constructor(config = {}) {
        this.config = {
            serverUrl: config.serverUrl ?? 'http://localhost:8080',
            apiKey: config.apiKey ?? '',
            timeout: config.timeout ?? 30000,
        };
    }
    /** Gửi message và nhận response */
    async sendMessage(message, options) {
        const response = await fetch(`${this.config.serverUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
            },
            body: JSON.stringify({
                message,
                provider: options?.provider,
                agentRole: options?.agentRole,
                maxTokens: options?.maxTokens,
                temperature: options?.temperature,
            }),
            signal: AbortSignal.timeout(this.config.timeout),
        });
        if (!response.ok) {
            throw new Error(`GHITA API error: ${response.status}`);
        }
        return (await response.json());
    }
    /** Kiểm tra server status */
    async getStatus() {
        const response = await fetch(`${this.config.serverUrl}/health`, {
            signal: AbortSignal.timeout(5000),
        });
        return (await response.json());
    }
    /** Lấy danh sách providers khả dụng */
    async getProviders() {
        const response = await fetch(`${this.config.serverUrl}/api/providers`, {
            signal: AbortSignal.timeout(5000),
        });
        const data = (await response.json());
        return data.providers;
    }
    /** Lấy danh sách subagents khả dụng */
    async getSubagents() {
        try {
            const response = await fetch(`${this.config.serverUrl}/api/subagents`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok)
                return [];
            const data = (await response.json());
            return data.subagents || [];
        }
        catch {
            return []; // Fallback for network/mock environments
        }
    }
    /** Kích hoạt vòng lặp tự sửa sai Ralph Loop cho một tác vụ */
    async runRalphLoop(task, maxIterations = 5) {
        const response = await fetch(`${this.config.serverUrl}/api/ralph-loop`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
            },
            body: JSON.stringify({ task, maxIterations }),
            signal: AbortSignal.timeout(this.config.timeout),
        });
        if (!response.ok) {
            throw new Error(`GHITA Ralph Loop API error: ${response.status}`);
        }
        return await response.json();
    }
}
//# sourceMappingURL=client.js.map