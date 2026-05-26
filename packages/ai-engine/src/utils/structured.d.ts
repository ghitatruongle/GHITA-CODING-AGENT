import { z } from 'zod';
import type { ChatMessage, ChatOptions } from '../types.js';
import type { Orchestrator } from '../orchestrator.js';
import type { AIProviderType } from '@ghita/shared';
/**
 * Converts a Zod schema to a clean JSON Schema.
 */
export declare function zodToJsonSchema(schema: z.ZodTypeAny): any;
/**
 * Extracts a JSON substring from a potentially conversational or markdown-formatted response.
 */
export declare function extractJsonFromText(text: string): string;
export interface GenerateObjectResponse<T> {
    object: T;
    rawResponse: string;
}
/**
 * Generates a structured object matching a Zod schema using system prompt-engineering.
 */
export declare function generateObject<T>(orchestrator: Orchestrator, schema: z.ZodType<T>, messages: ChatMessage[], options?: ChatOptions & {
    provider?: AIProviderType;
}): Promise<GenerateObjectResponse<T>>;
//# sourceMappingURL=structured.d.ts.map