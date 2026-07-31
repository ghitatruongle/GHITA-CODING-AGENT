import type { ChatMessage, ChatOptions, ChatToolCall, ChatToolDefinition } from '../types.js';

interface GooglePart {
  text?: string;
  functionCall?: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
}

export interface GoogleContent {
  role: 'user' | 'model';
  parts: GooglePart[];
}

export function googleSystemInstruction(
  messages: ChatMessage[],
): { parts: Array<{ text: string }> } | undefined {
  const content = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter(Boolean)
    .join('\n\n');
  return content ? { parts: [{ text: content }] } : undefined;
}

export function toGoogleContents(messages: ChatMessage[]): GoogleContent[] {
  const result: GoogleContent[] = [];
  const callNames = new Map<string, string>();
  const pendingNames: string[] = [];

  for (const message of messages) {
    if (message.role === 'system') continue;

    if (message.role === 'tool') {
      const name =
        (message.toolCallId ? callNames.get(message.toolCallId) : undefined) ??
        pendingNames.shift() ??
        'unknown_tool';
      const part: GooglePart = {
        functionResponse: {
          id: message.toolCallId,
          name,
          response: { result: message.content },
        },
      };
      const previous = result.at(-1);
      if (previous?.role === 'user' && previous.parts.every((item) => item.functionResponse)) {
        previous.parts.push(part);
      } else {
        result.push({ role: 'user', parts: [part] });
      }
      continue;
    }

    const parts: GooglePart[] = [];
    if (message.content) parts.push({ text: message.content });
    if (message.role === 'assistant' && message.toolCalls?.length) {
      for (const call of message.toolCalls) {
        if (call.id) callNames.set(call.id, call.name);
        else pendingNames.push(call.name);
        parts.push({
          functionCall: {
            id: call.id,
            name: call.name,
            args: call.arguments ?? {},
          },
        });
      }
    }
    result.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: parts.length ? parts : [{ text: '' }],
    });
  }

  return result;
}

export function toGoogleTools(
  tools: ChatToolDefinition[] | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!tools?.length) return undefined;
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    },
  ];
}

export function googleToolFields(options?: ChatOptions): Record<string, unknown> {
  const tools = toGoogleTools(options?.tools);
  if (!tools) return {};
  const mode =
    options?.toolChoice === 'required' ? 'ANY' : options?.toolChoice === 'none' ? 'NONE' : 'AUTO';
  return {
    tools,
    toolConfig: {
      functionCallingConfig: { mode },
    },
  };
}

export function extractGoogleToolCalls(parts: GooglePart[] | undefined): ChatToolCall[] {
  if (!Array.isArray(parts)) return [];
  return parts.flatMap((part) => {
    const call = part.functionCall;
    if (!call || typeof call.name !== 'string') return [];
    const args = call.args;
    if (!args || typeof args !== 'object' || Array.isArray(args)) return [];
    return [
      {
        id: typeof call.id === 'string' ? call.id : undefined,
        name: call.name,
        arguments: args,
      },
    ];
  });
}
