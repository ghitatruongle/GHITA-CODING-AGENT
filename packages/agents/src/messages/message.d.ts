import type { MessageRole, ContentPart, ToolCall, MessageMetadata, MessageData } from './types.js';
export declare abstract class BaseMessage {
    abstract readonly role: MessageRole;
    readonly id: string;
    readonly content: string | ContentPart[];
    readonly name?: string;
    readonly timestamp: number;
    readonly metadata?: MessageMetadata;
    constructor(content: string | ContentPart[], options?: {
        id?: string;
        name?: string;
        timestamp?: number;
        metadata?: MessageMetadata;
    });
    getText(): string;
    isMultimodal(): boolean;
    abstract toData(): MessageData;
}
export declare class HumanMessage extends BaseMessage {
    readonly role: "user";
    constructor(content: string | ContentPart[], options?: {
        id?: string;
        name?: string;
        timestamp?: number;
        metadata?: MessageMetadata;
    });
    toData(): MessageData;
}
export declare class AIMessage extends BaseMessage {
    readonly role: "assistant";
    readonly toolCalls?: ToolCall[];
    constructor(content: string | ContentPart[], options?: {
        id?: string;
        name?: string;
        timestamp?: number;
        metadata?: MessageMetadata;
        toolCalls?: ToolCall[];
    });
    toData(): MessageData;
}
export declare class SystemMessage extends BaseMessage {
    readonly role: "system";
    constructor(content: string | ContentPart[], options?: {
        id?: string;
        name?: string;
        timestamp?: number;
        metadata?: MessageMetadata;
    });
    toData(): MessageData;
}
export declare class ToolMessage extends BaseMessage {
    readonly role: "tool";
    readonly toolCallId: string;
    readonly toolName: string;
    constructor(content: string, toolCallId: string, toolName: string, options?: {
        id?: string;
        timestamp?: number;
        metadata?: MessageMetadata;
    });
    toData(): MessageData;
}
export declare class FunctionMessage extends BaseMessage {
    readonly role: "function";
    readonly functionName: string;
    constructor(content: string, functionName: string, options?: {
        id?: string;
        name?: string;
        timestamp?: number;
        metadata?: MessageMetadata;
    });
    toData(): MessageData;
}
/** Reconstruct a Message class instance from serialized MessageData */
export declare function messageFromData(data: MessageData): BaseMessage;
//# sourceMappingURL=message.d.ts.map