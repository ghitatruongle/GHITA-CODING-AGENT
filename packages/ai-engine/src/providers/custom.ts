// ==============================================================================
// GHITA CODING AGENT - Custom Provider (OpenAI-compatible endpoints)
// ==============================================================================

import type { AIStreamChunk } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse, ProviderConfig } from '../types.js';
import { BaseProvider } from './base.js';

export class CustomProvider extends BaseProvider {
  readonly type = 'custom' as const;
  readonly name = 'Custom';
  readonly defaultModel = '';
  readonly models: string[] = [];

  constructor(config: ProviderConfig) {
    super(config);
  }

  async isReady(): Promise<boolean> {
    return !!this.config.baseUrl;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) throw new Error('Custom provider: baseUrl not configured');

    const model = this.getModel(options);
    const apiKey = this.config.apiKey;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: this.getMaxTokens(options),
        temperature: this.getTemperature(options),
        stream: false,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Custom API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    return {
      content: data.choices[0]?.message?.content ?? '',
      model: data.model || model,
      provider: 'custom',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      finishReason: 'stop',
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<AIStreamChunk> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) throw new Error('Custom provider: baseUrl not configured');

    const model = this.getModel(options);
    const apiKey = this.config.apiKey;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: this.getMaxTokens(options),
        temperature: this.getTemperature(options),
        stream: true,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Custom API error (${response.status}): ${error}`);
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
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { content: '', done: true, provider: 'custom', model };
            return;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices: Array<{ delta: { content?: string } }>;
            };
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              yield { content, done: false, provider: 'custom', model };
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true, provider: 'custom', model };
  }
}
