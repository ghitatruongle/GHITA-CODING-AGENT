import type { AIStreamChunk } from '@ghita/shared';
import { OLLAMA_DEFAULT_URL } from '@ghita/shared';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ProviderConfig,
  EmbeddingResponse,
  EmbeddingManyResponse,
} from '../types.js';
import { BaseProvider } from './base.js';

interface OllamaToolDef {
  type: 'function';
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

interface OllamaChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
  format?: Record<string, unknown> | 'json';
  tools?: OllamaToolDef[];
  think?: boolean | string;
  options?: Record<string, unknown>;
}

interface OllamaChatResponseData {
  message?: {
    content: string;
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  };
  model: string;
  done: boolean;
  eval_count: number;
  prompt_eval_count: number;
  thinking?: string;
}

export class OllamaProvider extends BaseProvider {
  readonly type = 'ollama' as const;
  readonly name = 'Ollama (Local)';
  readonly defaultModel = 'llama3';
  readonly models: string[] = [];

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

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.getOllamaUrl()}/api/tags`);
      if (!response.ok) return [];
      const data = (await response.json()) as { models: Array<{ name: string }> };
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }

  private buildRequestBody(
    model: string,
    messages: ChatMessage[],
    stream: boolean,
    options?: ChatOptions,
  ): OllamaChatRequest {
    const body: OllamaChatRequest = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content ?? '' })),
      stream,
      options: {
        num_predict: this.getMaxTokens(options),
        temperature: this.getTemperature(options),
      },
    };

    // v1.1.5-beta1 T4.2: format (structured JSON output)
    const format = (options as Record<string, unknown>)?.format as
      | Record<string, unknown>
      | 'json'
      | undefined;
    if (format) body.format = format;

    // v1.1.5-beta1 T4.2: tools (function calling)
    const tools = (options as Record<string, unknown>)?.tools as OllamaToolDef[] | undefined;
    if (tools && tools.length > 0) body.tools = tools;

    // v1.1.5-beta1 T4.2: think (reasoning tokens for qwen3/deepseek-r1)
    const think = (options as Record<string, unknown>)?.think as boolean | string | undefined;
    if (think !== undefined) body.think = think;

    return body;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = this.getModel(options);
    const baseUrl = this.getOllamaUrl();
    const body = this.buildRequestBody(model, messages, false, options);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error (${response.status}): ${error.slice(0, 200)}`);
    }

    const data = (await response.json()) as OllamaChatResponseData;
    const content = data.message?.content ?? '';
    const thinking = data.thinking;

    // Extract tool calls if present (function-calling models like llama3/qwen).
    const toolCalls = data.message?.tool_calls?.map((tc) => ({
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    return {
      content: thinking ? `${thinking}\n\n${content}` : content,
      model: data.model,
      provider: 'ollama',
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: data.done ? 'stop' : 'length',
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk> {
    const model = this.getModel(options);
    const baseUrl = this.getOllamaUrl();
    const body = this.buildRequestBody(model, messages, true, options);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error (${response.status}): ${error.slice(0, 200)}`);
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
              thinking?: string;
            };
            // Yield thinking before content — reasoning precedes the answer.
            if (parsed.thinking) {
              yield {
                content: parsed.thinking,
                done: false,
                provider: 'ollama',
                model,
              };
            }
            if (parsed.message?.content) {
              yield { content: parsed.message.content, done: false, provider: 'ollama', model };
            }
            if (parsed.done) {
              yield { content: '', done: true, provider: 'ollama', model };
              return;
            }
          } catch {
            /* skip malformed JSON */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    yield { content: '', done: true, provider: 'ollama', model };
  }

  async embed(text: string, options?: { model?: string }): Promise<EmbeddingResponse> {
    const model = options?.model ?? 'nomic-embed-text';
    const baseUrl = this.getOllamaUrl();
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error (${response.status}): ${error}`);
    }
    const data = (await response.json()) as {
      model: string;
      embeddings: number[][];
      prompt_eval_count?: number;
    };
    return {
      embedding: data.embeddings[0] ?? [],
      model: data.model,
      provider: 'ollama',
      usage: data.prompt_eval_count
        ? { promptTokens: data.prompt_eval_count, totalTokens: data.prompt_eval_count }
        : undefined,
    };
  }

  async embedMany(texts: string[], options?: { model?: string }): Promise<EmbeddingManyResponse> {
    const model = options?.model ?? 'nomic-embed-text';
    const baseUrl = this.getOllamaUrl();
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error (${response.status}): ${error}`);
    }
    const data = (await response.json()) as {
      model: string;
      embeddings: number[][];
      prompt_eval_count?: number;
    };
    return {
      embeddings: data.embeddings ?? [],
      model: data.model,
      provider: 'ollama',
      usage: data.prompt_eval_count
        ? { promptTokens: data.prompt_eval_count, totalTokens: data.prompt_eval_count }
        : undefined,
    };
  }
}
