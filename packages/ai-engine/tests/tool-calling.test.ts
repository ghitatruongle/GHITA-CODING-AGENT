import { describe, expect, it } from 'vitest';
import {
  extractOpenAIToolCalls,
  OpenAIStreamToolAccumulator,
  openAIToolFields,
  toOpenAIChatMessages,
} from '../src/providers/openai-tool-calling.js';
import {
  anthropicToolFields,
  extractAnthropicToolCalls,
  toAnthropicMessages,
} from '../src/providers/anthropic-tool-calling.js';
import {
  extractGoogleToolCalls,
  googleSystemInstruction,
  googleToolFields,
  toGoogleContents,
} from '../src/providers/google-tool-calling.js';

describe('provider-native tool calling', () => {
  it('serializes tools, assistant calls, and tool observations', () => {
    expect(
      toOpenAIChatMessages([
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { filePath: 'README.md' } }],
        },
        {
          role: 'tool',
          toolCallId: 'call-1',
          content: 'hello',
        },
      ]),
    ).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"filePath":"README.md"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call-1', content: 'hello' },
    ]);

    expect(
      openAIToolFields({
        tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object' } }],
      }),
    ).toEqual({
      tool_choice: 'auto',
      tools: [
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Read a file',
            parameters: { type: 'object' },
          },
        },
      ],
    });
  });

  it('rejects malformed arguments instead of executing them', () => {
    expect(
      extractOpenAIToolCalls([
        {
          id: 'call-1',
          function: { name: 'read_file', arguments: '{"filePath":"README.md"}' },
        },
        {
          id: 'call-2',
          function: { name: 'run_command', arguments: '{broken' },
        },
      ]),
    ).toEqual([
      {
        id: 'call-1',
        name: 'read_file',
        arguments: { filePath: 'README.md' },
      },
    ]);
  });

  it('reconstructs fragmented OpenAI stream tool calls', () => {
    const accumulator = new OpenAIStreamToolAccumulator();
    accumulator.append([
      {
        index: 0,
        id: 'call-1',
        function: { name: 'read_', arguments: '{"file' },
      },
    ]);
    accumulator.append([
      {
        index: 0,
        function: { name: 'file', arguments: 'Path":"README.md"}' },
      },
    ]);
    expect(accumulator.complete()).toEqual([
      { id: 'call-1', name: 'read_file', arguments: { filePath: 'README.md' } },
    ]);
  });

  it('serializes and extracts Anthropic tool-use blocks', () => {
    expect(
      toAnthropicMessages([
        { role: 'system', content: 'Be safe.' },
        {
          role: 'assistant',
          content: 'Checking.',
          toolCalls: [
            { id: 'toolu_1', name: 'read_file', arguments: { filePath: 'README.md' } },
            { id: 'toolu_2', name: 'list_files', arguments: {} },
          ],
        },
        { role: 'tool', toolCallId: 'toolu_1', content: 'hello' },
        { role: 'tool', toolCallId: 'toolu_2', content: 'README.md' },
      ]),
    ).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking.' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'read_file',
            input: { filePath: 'README.md' },
          },
          { type: 'tool_use', id: 'toolu_2', name: 'list_files', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: 'hello' },
          { type: 'tool_result', tool_use_id: 'toolu_2', content: 'README.md' },
        ],
      },
    ]);
    expect(
      anthropicToolFields({
        tools: [{ name: 'read_file', description: 'Read', parameters: { type: 'object' } }],
        toolChoice: 'required',
      }),
    ).toMatchObject({ tool_choice: { type: 'any' } });
    expect(
      extractAnthropicToolCalls([
        { type: 'text', text: 'Checking.' },
        { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { filePath: 'README.md' } },
      ]),
    ).toEqual([
      {
        id: 'toolu_1',
        name: 'read_file',
        arguments: { filePath: 'README.md' },
      },
    ]);
  });

  it('serializes Gemini function calls, results, and system instructions', () => {
    const messages = [
      { role: 'system' as const, content: 'Be safe.' },
      {
        role: 'assistant' as const,
        content: '',
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { filePath: 'README.md' } }],
      },
      { role: 'tool' as const, toolCallId: 'call-1', content: 'hello' },
    ];
    expect(googleSystemInstruction(messages)).toEqual({ parts: [{ text: 'Be safe.' }] });
    expect(toGoogleContents(messages)).toEqual([
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              id: 'call-1',
              name: 'read_file',
              args: { filePath: 'README.md' },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call-1',
              name: 'read_file',
              response: { result: 'hello' },
            },
          },
        ],
      },
    ]);
    expect(
      googleToolFields({
        tools: [{ name: 'read_file', description: 'Read', parameters: { type: 'object' } }],
        toolChoice: 'none',
      }),
    ).toMatchObject({
      toolConfig: { functionCallingConfig: { mode: 'NONE' } },
    });
    expect(
      extractGoogleToolCalls([
        { text: 'Checking.' },
        { functionCall: { id: 'call-1', name: 'read_file', args: { filePath: 'README.md' } } },
      ]),
    ).toEqual([
      {
        id: 'call-1',
        name: 'read_file',
        arguments: { filePath: 'README.md' },
      },
    ]);
  });
});
