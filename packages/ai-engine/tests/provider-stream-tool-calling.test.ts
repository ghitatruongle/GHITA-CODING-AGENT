import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { GoogleProvider } from '../src/providers/google.js';
import { OpenAIProvider } from '../src/providers/openai.js';

const toolOptions = {
  tools: [
    {
      name: 'read_file',
      description: 'Read a file',
      parameters: { type: 'object', properties: { filePath: { type: 'string' } } },
    },
  ],
  toolChoice: 'auto' as const,
};

function streamingResponse(frames: string[], contentType = 'text/event-stream'): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': contentType } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streaming provider tool calling', () => {
  it('sends OpenAI tools and reconstructs fragmented tool-call deltas', async () => {
    let requestBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body));
        return streamingResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_","arguments":"{\\"file"}}]}}]}\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"file","arguments":"Path\\":\\"README.md\\"}"}}]}}]}\n',
          'data: [DONE]\n\n',
        ]);
      }),
    );

    const provider = new OpenAIProvider({ type: 'openai', apiKey: 'test', defaultModel: 'test' });
    const chunks = [];
    for await (const chunk of provider.chatStream(
      [{ role: 'user', content: 'read' }],
      toolOptions,
    )) {
      chunks.push(chunk);
    }

    expect(requestBody['tools']).toBeDefined();
    expect(chunks.at(-1)?.toolCalls).toEqual([
      { id: 'call-1', name: 'read_file', arguments: { filePath: 'README.md' } },
    ]);
  });

  it('sends Anthropic tools and reconstructs input_json_delta events', async () => {
    let requestBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body));
        return streamingResponse([
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu-1","name":"read_file"}}\n',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"filePath\\":"}}\n',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"README.md\\"}"}}\n',
          'data: {"type":"message_stop"}\n\n',
        ]);
      }),
    );

    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'test',
    });
    const chunks = [];
    for await (const chunk of provider.chatStream(
      [{ role: 'user', content: 'read' }],
      toolOptions,
    )) {
      chunks.push(chunk);
    }

    expect(requestBody['tools']).toBeDefined();
    expect(chunks.at(-1)?.toolCalls).toEqual([
      { id: 'toolu-1', name: 'read_file', arguments: { filePath: 'README.md' } },
    ]);
  });

  it('uses Gemini SSE and emits function calls without regex parsing', async () => {
    let requestedUrl = '';
    let requestBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestBody = JSON.parse(String(init?.body));
        return streamingResponse([
          'data: {"candidates":[{"content":{"parts":[{"text":"Checking.\\n"}]}}]}\n\n',
          'data: {"candidates":[{"content":{"parts":[{"functionCall":{"id":"g-1","name":"read_file","args":{"filePath":"README.md"}}}]}}]}\n\n',
        ]);
      }),
    );

    const provider = new GoogleProvider({ type: 'google', apiKey: 'test', defaultModel: 'test' });
    const chunks = [];
    for await (const chunk of provider.chatStream(
      [{ role: 'user', content: 'read' }],
      toolOptions,
    )) {
      chunks.push(chunk);
    }

    expect(requestedUrl).toContain('alt=sse');
    expect(requestBody['tools']).toBeDefined();
    expect(chunks.map((chunk) => chunk.content).join('')).toContain('Checking.');
    expect(chunks.at(-1)?.toolCalls).toEqual([
      { id: 'g-1', name: 'read_file', arguments: { filePath: 'README.md' } },
    ]);
  });
});
