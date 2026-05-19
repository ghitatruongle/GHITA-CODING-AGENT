// ==============================================================================
// GHITA CODING AGENT - Google Gemini Provider
// ==============================================================================

import type { AIStreamChunk } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse, ProviderConfig } from '../types.js';
import { BaseProvider } from './base.js';

const GOOGLE_MODELS = [
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-2.0-flash-exp',
  'gemini-pro',
];

export class GoogleProvider extends BaseProvider {
  readonly type = 'google' as const;
  readonly name = 'Google';
  readonly defaultModel = 'gemini-1.5-pro';
  readonly models = GOOGLE_MODELS;

  constructor(config: ProviderConfig) {
    super(config);
  }

  async isReady(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const apiKey = this.getApiKey();
    const model = this.getModel(options);

    const contents = this.convertMessages(messages);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: this.getMaxTokens(options),
            temperature: this.getTemperature(options),
            topP: options?.topP,
            stopSequences: options?.stop,
          },
        }),
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
        finishReason: string;
      }>;
      usageMetadata: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const content = data.candidates[0]?.content?.parts?.map((p) => p.text).join('') ?? '';

    return {
      content,
      model,
      provider: 'google',
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
      finishReason: this.mapFinishReason(data.candidates[0]?.finishReason),
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<AIStreamChunk> {
    const apiKey = this.getApiKey();
    const model = this.getModel(options);

    const contents = this.convertMessages(messages);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: this.getMaxTokens(options),
            temperature: this.getTemperature(options),
          },
        }),
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error (${response.status}): ${error}`);
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

        // Google streams JSON array chunks
        const jsonMatch = buffer.match(/\{"candidates":\[.*?\]\}/);
        if (jsonMatch) {
          buffer = buffer.slice(jsonMatch.index! + jsonMatch[0].length);
          try {
            const parsed = JSON.parse(jsonMatch[0]) as {
              candidates: Array<{
                content: { parts: Array<{ text: string }> };
                finishReason?: string;
              }>;
            };
            const text = parsed.candidates[0]?.content?.parts
              ?.map((p) => p.text)
              .join('');
            if (text) {
              yield { content: text, done: false, provider: 'google', model };
            }
          } catch {
            // skip malformed
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true, provider: 'google', model };
  }

  private convertMessages(
    messages: ChatMessage[],
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
  }

  private mapFinishReason(
    reason: string | undefined,
  ): 'stop' | 'length' | 'error' | 'aborted' {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      default:
        return 'stop';
    }
  }
}
