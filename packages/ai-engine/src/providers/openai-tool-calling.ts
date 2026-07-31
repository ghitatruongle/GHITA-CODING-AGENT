import type { ChatMessage, ChatOptions, ChatToolCall, ChatToolDefinition } from '../types.js';

interface OpenAIToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface OpenAIStreamToolDelta {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export class OpenAIStreamToolAccumulator {
  private readonly calls = new Map<number, { id?: string; name: string; argumentsText: string }>();

  append(deltas: OpenAIStreamToolDelta[] | undefined): void {
    for (const delta of deltas ?? []) {
      const index = delta.index ?? 0;
      const current = this.calls.get(index) ?? { name: '', argumentsText: '' };
      if (delta.id) current.id = delta.id;
      if (delta.function?.name) current.name += delta.function.name;
      if (delta.function?.arguments) current.argumentsText += delta.function.arguments;
      this.calls.set(index, current);
    }
  }

  complete(): ChatToolCall[] {
    return [...this.calls.entries()]
      .sort(([left], [right]) => left - right)
      .flatMap(([, call]) => {
        try {
          const args = JSON.parse(call.argumentsText || '{}') as unknown;
          if (!args || typeof args !== 'object' || Array.isArray(args) || !call.name) return [];
          return [
            {
              id: call.id,
              name: call.name,
              arguments: args as Record<string, unknown>,
            },
          ];
        } catch {
          return [];
        }
      });
  }
}

export function toOpenAIChatMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      };
    }

    const result: Record<string, unknown> = {
      role: message.role,
      content: message.content,
    };
    if (message.role === 'assistant' && message.toolCalls?.length) {
      result['tool_calls'] = message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments ?? {}),
        },
      }));
    }
    return result;
  });
}

export function toOpenAITools(
  tools: ChatToolDefinition[] | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function openAIToolFields(options?: ChatOptions): Record<string, unknown> {
  const tools = toOpenAITools(options?.tools);
  if (!tools) return {};
  return {
    tools,
    tool_choice: options?.toolChoice ?? 'auto',
  };
}

export function extractOpenAIToolCalls(toolCalls: OpenAIToolCall[] | undefined): ChatToolCall[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.flatMap((call) => {
    const name = call.function?.name;
    if (!name) return [];
    let args: unknown = {};
    try {
      args = JSON.parse(call.function?.arguments ?? '{}');
    } catch {
      return [];
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) return [];
    return [
      {
        id: call.id,
        name,
        arguments: args as Record<string, unknown>,
      },
    ];
  });
}
