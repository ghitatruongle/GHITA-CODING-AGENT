import type { ChatMessage, ChatOptions, ChatToolCall, ChatToolDefinition } from '../types.js';

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

type AnthropicContentBlock = AnthropicToolUseBlock | AnthropicTextBlock | AnthropicToolResultBlock;

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

function generatedToolUseId(messageIndex: number, callIndex: number): string {
  return `toolu_ghita_${messageIndex}_${callIndex}`;
}

export function toAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];
  const pendingGeneratedIds: string[] = [];

  for (const [messageIndex, message] of messages.entries()) {
    if (message.role === 'system') continue;

    if (message.role === 'tool') {
      const block: AnthropicToolResultBlock = {
        type: 'tool_result',
        tool_use_id: message.toolCallId ?? pendingGeneratedIds.shift() ?? 'toolu_ghita_unknown',
        content: message.content,
      };
      const previous = result.at(-1);
      if (previous?.role === 'user' && Array.isArray(previous.content)) {
        previous.content.push(block);
      } else {
        result.push({ role: 'user', content: [block] });
      }
      continue;
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      const blocks: AnthropicContentBlock[] = [];
      if (message.content) blocks.push({ type: 'text', text: message.content });
      for (const [callIndex, call] of message.toolCalls.entries()) {
        const id = call.id ?? generatedToolUseId(messageIndex, callIndex);
        if (!call.id) pendingGeneratedIds.push(id);
        blocks.push({
          type: 'tool_use',
          id,
          name: call.name,
          input: call.arguments ?? {},
        });
      }
      result.push({ role: 'assistant', content: blocks });
      continue;
    }

    result.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    });
  }

  return result;
}

export function toAnthropicTools(
  tools: ChatToolDefinition[] | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

export function anthropicToolFields(options?: ChatOptions): Record<string, unknown> {
  const tools = toAnthropicTools(options?.tools);
  if (!tools) return {};
  const choiceType =
    options?.toolChoice === 'required' ? 'any' : options?.toolChoice === 'none' ? 'none' : 'auto';
  return {
    tools,
    tool_choice: { type: choiceType },
  };
}

export function extractAnthropicToolCalls(
  content: Array<Record<string, unknown>> | undefined,
): ChatToolCall[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (block['type'] !== 'tool_use' || typeof block['name'] !== 'string') return [];
    const input = block['input'];
    if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
    return [
      {
        id: typeof block['id'] === 'string' ? block['id'] : undefined,
        name: block['name'],
        arguments: input as Record<string, unknown>,
      },
    ];
  });
}
