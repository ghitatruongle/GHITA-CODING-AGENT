// ==============================================================================
// GHITA CODING AGENT - Structured Output Support
// ==============================================================================

import { z } from 'zod';
import { AIValidationError } from '../errors/index.js';
import type { ChatMessage, ChatOptions } from '../types.js';
import type { Orchestrator } from '../orchestrator.js';
import type { AIProviderType } from '@ghita/shared';

/**
 * Converts a Zod schema to a clean JSON Schema.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  const def = schema._def;

  if (schema instanceof z.ZodObject) {
    const properties: any = {};
    const required: string[] = [];
    const shape = schema.shape;
    for (const key in shape) {
      const propSchema = shape[key];
      properties[key] = zodToJsonSchema(propSchema);
      if (!(propSchema instanceof z.ZodOptional) && !(propSchema instanceof z.ZodNullable)) {
        required.push(key);
      }
    }
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: def.values,
    };
  }

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return zodToJsonSchema(def.innerType);
  }

  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchema(def.schema);
  }

  if (schema instanceof z.ZodUnion) {
    return {
      anyOf: def.options.map((opt: any) => zodToJsonSchema(opt)),
    };
  }

  return { type: 'any' };
}

/**
 * Extracts a JSON substring from a potentially conversational or markdown-formatted response.
 */
export function extractJsonFromText(text: string): string {
  // Try to locate JSON inside ```json ... ``` or ``` ... ```
  const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (markdownMatch && markdownMatch[1]) {
    return markdownMatch[1].trim();
  }

  // Find first { or [ and matching last } or ]
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = text.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = text.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return text.substring(startIdx, endIdx + 1).trim();
  }

  return text.trim();
}

export interface GenerateObjectResponse<T> {
  object: T;
  rawResponse: string;
}

/**
 * Generates a structured object matching a Zod schema using system prompt-engineering.
 */
export async function generateObject<T>(
  orchestrator: Orchestrator,
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  options?: ChatOptions & { provider?: AIProviderType }
): Promise<GenerateObjectResponse<T>> {
  const jsonSchema = zodToJsonSchema(schema);
  const schemaStr = JSON.stringify(jsonSchema, null, 2);

  // System instruction to enforce structured output
  const systemInstruction = `
IMPORTANT: You MUST respond ONLY with a single valid JSON object or array matching the JSON Schema below.
Do NOT write any conversational text, introductions, or explanations before or after the JSON.
Ensure your response is valid JSON.

JSON Schema:
${schemaStr}
`;

  // We append or prepend this system instruction.
  // We'll append a clean instruction to the system or user prompts.
  const modifiedMessages: ChatMessage[] = [...messages];
  const systemMessageIdx = modifiedMessages.findIndex((m) => m.role === 'system');

  if (systemMessageIdx !== -1) {
    modifiedMessages[systemMessageIdx] = {
      role: 'system',
      content: modifiedMessages[systemMessageIdx]!.content + '\n' + systemInstruction,
    };
  } else {
    modifiedMessages.unshift({
      role: 'system',
      content: systemInstruction,
    });
  }

  // Invoke chat API
  const response = await orchestrator.chat(modifiedMessages, options);
  const rawResponse = response.content;

  // Extract JSON string
  const jsonStr = extractJsonFromText(rawResponse);
  if (!jsonStr) {
    throw new AIValidationError(schemaStr, rawResponse, [], 'No JSON block found in response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new AIValidationError(
      schemaStr,
      rawResponse,
      [err],
      `Failed to parse response content as JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Validate with Zod
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AIValidationError(
      schemaStr,
      rawResponse,
      result.error.errors,
      'Response JSON did not match the requested schema schema'
    );
  }

  return {
    object: result.data,
    rawResponse,
  };
}
