// ==============================================================================
// GHITA CODING AGENT - Message Classes
// ==============================================================================

import type {
  MessageRole,
  ContentPart,
  ToolCall,
  MessageMetadata,
  MessageData,
} from './types.js';

function generateMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export abstract class BaseMessage {
  abstract readonly role: MessageRole;
  readonly id: string;
  readonly content: string | ContentPart[];
  readonly name?: string;
  readonly timestamp: number;
  readonly metadata?: MessageMetadata;

  constructor(
    content: string | ContentPart[],
    options?: { id?: string; name?: string; timestamp?: number; metadata?: MessageMetadata },
  ) {
    this.id = options?.id ?? generateMessageId();
    this.content = content;
    this.name = options?.name;
    this.timestamp = options?.timestamp ?? Date.now();
    this.metadata = options?.metadata;
  }

  getText(): string {
    if (typeof this.content === 'string') return this.content;
    return this.content
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text ?? '')
      .join('\n');
  }

  isMultimodal(): boolean {
    return Array.isArray(this.content);
  }

  abstract toData(): MessageData;
}

export class HumanMessage extends BaseMessage {
  readonly role = 'user' as const;

  constructor(
    content: string | ContentPart[],
    options?: { id?: string; name?: string; timestamp?: number; metadata?: MessageMetadata },
  ) {
    super(content, options);
  }

  toData(): MessageData {
    return {
      id: this.id,
      role: this.role,
      content: this.content,
      name: this.name,
      timestamp: this.timestamp,
      metadata: this.metadata,
    };
  }
}

export class AIMessage extends BaseMessage {
  readonly role = 'assistant' as const;
  readonly toolCalls?: ToolCall[];

  constructor(
    content: string | ContentPart[],
    options?: {
      id?: string;
      name?: string;
      timestamp?: number;
      metadata?: MessageMetadata;
      toolCalls?: ToolCall[];
    },
  ) {
    super(content, options);
    this.toolCalls = options?.toolCalls;
  }

  toData(): MessageData {
    return {
      id: this.id,
      role: this.role,
      content: this.content,
      name: this.name,
      timestamp: this.timestamp,
      metadata: this.metadata,
      toolCalls: this.toolCalls,
    };
  }
}

export class SystemMessage extends BaseMessage {
  readonly role = 'system' as const;

  constructor(
    content: string | ContentPart[],
    options?: { id?: string; name?: string; timestamp?: number; metadata?: MessageMetadata },
  ) {
    super(content, options);
  }

  toData(): MessageData {
    return {
      id: this.id,
      role: this.role,
      content: this.content,
      name: this.name,
      timestamp: this.timestamp,
      metadata: this.metadata,
    };
  }
}

export class ToolMessage extends BaseMessage {
  readonly role = 'tool' as const;
  readonly toolCallId: string;
  readonly toolName: string;

  constructor(
    content: string,
    toolCallId: string,
    toolName: string,
    options?: { id?: string; timestamp?: number; metadata?: MessageMetadata },
  ) {
    super(content, options);
    this.toolCallId = toolCallId;
    this.toolName = toolName;
  }

  toData(): MessageData {
    return {
      id: this.id,
      role: this.role,
      content: this.content,
      timestamp: this.timestamp,
      metadata: this.metadata,
      toolCallId: this.toolCallId,
      toolName: this.toolName,
    };
  }
}

/**
 * @deprecated The 'function' role is deprecated in the OpenAI API. Use ToolMessage instead.
 * Kept for backward compatibility with legacy function-calling responses.
 * WARNING: This class may be removed in a future major version.
 */
export class FunctionMessage extends BaseMessage {
  readonly role = 'function' as const;
  readonly functionName: string;

  constructor(
    content: string,
    functionName: string,
    options?: { id?: string; name?: string; timestamp?: number; metadata?: MessageMetadata },
  ) {
    super(content, options);
    this.functionName = functionName;
  }

  toData(): MessageData {
    return {
      id: this.id,
      role: this.role,
      content: this.content,
      name: this.name,
      timestamp: this.timestamp,
      metadata: this.metadata,
      functionName: this.functionName,
    };
  }
}

/** Reconstruct a Message class instance from serialized MessageData */
export function messageFromData(data: MessageData): BaseMessage {
  switch (data.role) {
    case 'user':
      return new HumanMessage(data.content, data);
    case 'assistant':
      return new AIMessage(data.content, { ...data, toolCalls: data.toolCalls });
    case 'system':
      return new SystemMessage(data.content, data);
    case 'tool':
      return new ToolMessage(
        typeof data.content === 'string' ? data.content : '',
        data.toolCallId,
        data.toolName,
        data,
      );
    case 'function':
      return new FunctionMessage(
        typeof data.content === 'string' ? data.content : '',
        data.functionName,
        data,
      );
    default:
      throw new Error(`Unknown message role: ${(data as { role: string }).role}`);
  }
}
