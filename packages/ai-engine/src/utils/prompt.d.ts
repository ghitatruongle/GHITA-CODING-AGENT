import type { ChatMessage, ChatRole } from '../types.js';
/**
 * Universal template renderer supporting both {{variable}} and {variable} patterns.
 */
export declare function renderTemplate(template: string, variables: Record<string, any>): string;
/**
 * Basic String Prompt Template
 */
export declare class PromptTemplate {
    readonly template: string;
    readonly inputVariables?: string[] | undefined;
    constructor(template: string, inputVariables?: string[] | undefined);
    format(variables: Record<string, any>): string;
}
/**
 * Chat Message Prompt Template
 */
export interface ChatMessageTemplate {
    role: ChatRole;
    template: string;
}
export declare class ChatPromptTemplate {
    readonly messages: ChatMessageTemplate[];
    readonly inputVariables?: string[] | undefined;
    constructor(messages: ChatMessageTemplate[], inputVariables?: string[] | undefined);
    formatMessages(variables: Record<string, any>): ChatMessage[];
}
/**
 * Few-Shot Prompt Template
 */
export interface FewShotPromptOptions {
    examples: Record<string, any>[];
    examplePrompt: PromptTemplate;
    prefix: string;
    suffix: string;
    inputVariables: string[];
    exampleSeparator?: string;
}
export declare class FewShotPromptTemplate {
    private examples;
    private examplePrompt;
    private prefix;
    private suffix;
    private exampleSeparator;
    constructor(options: FewShotPromptOptions);
    format(variables: Record<string, any>): string;
}
/**
 * Pipeline Prompt Template: composes multiple sub-prompts dynamically
 */
export declare class PipelinePromptTemplate {
    readonly finalPrompt: PromptTemplate;
    readonly pipelinePrompts: Array<{
        parameterName: string;
        prompt: PromptTemplate;
    }>;
    constructor(finalPrompt: PromptTemplate, pipelinePrompts: Array<{
        parameterName: string;
        prompt: PromptTemplate;
    }>);
    format(variables: Record<string, any>): string;
}
export declare class PromptManager {
    private registry;
    register(name: string, template: any, version?: string): void;
    get(name: string, version?: string): any;
    delete(name: string, version?: string): void;
    clear(): void;
}
//# sourceMappingURL=prompt.d.ts.map