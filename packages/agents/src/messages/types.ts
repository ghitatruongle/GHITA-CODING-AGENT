// ==============================================================================
// GHITA CODING AGENT - Message System Types
// ==============================================================================

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'function';

export type ContentType = 'text' | 'image' | 'audio' | 'tool_call' | 'tool_result';

export interface ContentPart {
  type: ContentType;
  text?: string;
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  toolCallId?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface MessageMetadata {
  model?: string;
  provider?: string;
  tokenCount?: number;
  duration?: number;
  finishReason?: string;
  [key: string]: unknown;
}

export interface BaseMessageData {
  id: string;
  role: MessageRole;
  content: string | ContentPart[];
  name?: string;
  timestamp: number;
  metadata?: MessageMetadata;
}

export interface HumanMessageData extends BaseMessageData {
  role: 'user';
}

export interface AIMessageData extends BaseMessageData {
  role: 'assistant';
  toolCalls?: ToolCall[];
}

export interface SystemMessageData extends BaseMessageData {
  role: 'system';
}

export interface ToolMessageData extends BaseMessageData {
  role: 'tool';
  toolCallId: string;
  toolName: string;
}

export interface FunctionMessageData extends BaseMessageData {
  role: 'function';
  functionName: string;
}

export type MessageData =
  | HumanMessageData
  | AIMessageData
  | SystemMessageData
  | ToolMessageData
  | FunctionMessageData;
