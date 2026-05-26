// ==============================================================================
// GHITA CODING AGENT - Message Classes
// ==============================================================================
function generateMessageId() {
    return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
export class BaseMessage {
    id;
    content;
    name;
    timestamp;
    metadata;
    constructor(content, options) {
        this.id = options?.id ?? generateMessageId();
        this.content = content;
        this.name = options?.name;
        this.timestamp = options?.timestamp ?? Date.now();
        this.metadata = options?.metadata;
    }
    getText() {
        if (typeof this.content === 'string')
            return this.content;
        return this.content
            .filter((p) => p.type === 'text' && p.text)
            .map((p) => p.text)
            .join('\n');
    }
    isMultimodal() {
        return Array.isArray(this.content);
    }
}
export class HumanMessage extends BaseMessage {
    role = 'user';
    constructor(content, options) {
        super(content, options);
    }
    toData() {
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
    role = 'assistant';
    toolCalls;
    constructor(content, options) {
        super(content, options);
        this.toolCalls = options?.toolCalls;
    }
    toData() {
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
    role = 'system';
    constructor(content, options) {
        super(content, options);
    }
    toData() {
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
    role = 'tool';
    toolCallId;
    toolName;
    constructor(content, toolCallId, toolName, options) {
        super(content, options);
        this.toolCallId = toolCallId;
        this.toolName = toolName;
    }
    toData() {
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
export class FunctionMessage extends BaseMessage {
    role = 'function';
    functionName;
    constructor(content, functionName, options) {
        super(content, options);
        this.functionName = functionName;
    }
    toData() {
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
export function messageFromData(data) {
    switch (data.role) {
        case 'user':
            return new HumanMessage(data.content, data);
        case 'assistant':
            return new AIMessage(data.content, { ...data, toolCalls: data.toolCalls });
        case 'system':
            return new SystemMessage(data.content, data);
        case 'tool':
            return new ToolMessage(typeof data.content === 'string' ? data.content : '', data.toolCallId, data.toolName, data);
        case 'function':
            return new FunctionMessage(typeof data.content === 'string' ? data.content : '', data.functionName, data);
    }
}
//# sourceMappingURL=message.js.map