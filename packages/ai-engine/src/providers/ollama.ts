// ==============================================================================
// GHITA CODING AGENT - Ollama Provider (Local Models)
// ==============================================================================

import type { AIStreamChunk } from '@ghita/shared';
import { OLLAMA_DEFAULT_URL } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse, ProviderConfig } from '../types.js';
import { BaseProvider } from './base.js';

export class OllamaProvider extends BaseProvider {
  readonly type = 'ollama' as const;
  readonly name = 'Ollama (Local)';
  readonly defaultModel = 'llama3';
  readonly models: string[] = []; // Dynamic - fetched from Ollama

  constructor(config: ProviderConfig) {
    super(config);
  }

  private getOllamaUrl(): string {
    return this.config.baseUrl || OLLAMA_DEFAULT_URL;
  }

  async isReady(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getOllamaUrl()}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Lấy danh sách models từ Ollama */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.getOllamaUrl()}/api/tags`);
      if (!response.ok) return [];
      const data = (await response.json()) as {
        models: Array<{ name: string }>;
      };
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = this.getModel(options);
    const baseUrl = this.getOllamaUrl();

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          num_predict: this.getMaxTokens(options),
          temperature: this.getTemperature(options),
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error (${response.status}): ${error.slice(0, 200)}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      throw new Error(`Unexpected response type: ${contentType}`);
    }

    const data = (await response.json()) as {
      message: { content: string };
      model: string;
      done: boolean;
      eval_count: number;
      prompt_eval_count: number;
    };

    return {
      content: data.message?.content ?? '',
      model: data.model,
      provider: 'ollama',
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: data.done ? 'stop' : 'length',
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<AIStreamChunk> {
    const model = this.getModel(options);
    const baseUrl = this.getOllamaUrl();

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          num_predict: this.getMaxTokens(options),
          temperature: this.getTemperature(options),
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error (${response.status}): ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed) as {
              message?: { content: string };
              done: boolean;
            };

            if (parsed.message?.content) {
              yield {
                content: parsed.message.content,
                done: false,
                provider: 'ollama',
                model,
              };
            }

            if (parsed.done) {
              yield { content: '', done: true, provider: 'ollama', model };
              return;
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true, provider: 'ollama', model };
  }
}
