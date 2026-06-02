// ==============================================================================
// GHITA CODING AGENT - Agent SDK Client
// ==============================================================================

export interface AgentSDKConfig {
  serverUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export interface SendMessageOptions {
  provider?: string;
  agentRole?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

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
  private config: Required<AgentSDKConfig>;

  constructor(config: AgentSDKConfig = {}) {
    this.config = {
      serverUrl: config.serverUrl ?? 'http://localhost:8080',
      apiKey: config.apiKey ?? '',
      timeout: config.timeout ?? 30000,
    };
  }

  /** Gửi message và nhận response */
  async sendMessage(
    message: string,
    options?: SendMessageOptions,
  ): Promise<AgentMessage> {
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

    return (await response.json()) as AgentMessage;
  }

  /** Kiểm tra server status */
  async getStatus(): Promise<{ status: string; version: string }> {
    const response = await fetch(`${this.config.serverUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return (await response.json()) as { status: string; version: string };
  }

  /** Lấy danh sách providers khả dụng */
  async getProviders(): Promise<string[]> {
    const response = await fetch(`${this.config.serverUrl}/api/providers`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = (await response.json()) as { providers: string[] };
    return data.providers;
  }

  /** Lấy danh sách subagents khả dụng */
 async getSubagents(): Promise<Record<string, unknown>[]> {
 try {
 const response = await fetch(`${this.config.serverUrl}/api/subagents`, {
 signal: AbortSignal.timeout(5000),
 });
 if (!response.ok) return [];
 const data = (await response.json()) as { subagents: Record<string, unknown>[] };
      return data.subagents || [];
    } catch {
      return []; // Fallback for network/mock environments
    }
  }

  /** Kích hoạt vòng lặp tự sửa sai Ralph Loop cho một tác vụ */
  async runRalphLoop(task: string, maxIterations = 5): Promise<Record<string, unknown>> {
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
