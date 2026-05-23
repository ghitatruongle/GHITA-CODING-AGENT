// ==============================================================================
// GHITA CODING AGENT - Tool Call Repair Utility
// ==============================================================================

import { AIToolCallRepairError } from '../errors/index.js';
import type { ChatMessage, ChatOptions, ChatResponse } from '../types.js';
import type { Orchestrator } from '../orchestrator.js';
import type { AIProviderType } from '@ghita/shared';

export interface RepairOptions extends ChatOptions {
  provider?: AIProviderType;
  maxRetries?: number;
}

/**
 * Executes a chat query with automatic tool call repair.
 * If the parsing function throws an error, the utility appends corrective instructions
 * and asks the AI to repair its output, up to `maxRetries` times.
 */
export async function chatWithToolCallRepair<T>(
  orchestrator: Orchestrator,
  messages: ChatMessage[],
  parseFn: (text: string) => T,
  options?: RepairOptions
): Promise<{ parsed: T; response: ChatResponse }> {
  const maxRetries = options?.maxRetries ?? 3;
  const history: ChatMessage[] = [...messages];
  const toolErrors: unknown[] = [];

  let attempts = 0;
  while (attempts <= maxRetries) {
    let response: ChatResponse;
    try {
      response = await orchestrator.chat(history, options);
    } catch (err) {
      toolErrors.push(err);
      attempts++;
      if (attempts > maxRetries) {
        throw new AIToolCallRepairError(
          JSON.stringify(history),
          attempts,
          toolErrors,
          `Failed to get response from AI during tool call repair: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      continue;
    }

    try {
      const parsed = parseFn(response.content);
      return { parsed, response };
    } catch (parseErr) {
      toolErrors.push(parseErr);
      attempts++;

      if (attempts > maxRetries) {
        throw new AIToolCallRepairError(
          response.content,
          attempts,
          toolErrors,
          `Tool call parsing failed after ${attempts} attempts: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
        );
      }

      // Append assistant's invalid response to conversation history
      history.push({
        role: 'assistant',
        content: response.content,
      });

      // Append corrective feedback with instructions and logs
      history.push({
        role: 'user',
        content: `Your previous tool call output was invalid and caused a parsing error:
${parseErr instanceof Error ? parseErr.message : String(parseErr)}

Please correct the format and try again. Make sure your output matches the expected tool call syntax/schema perfectly.`,
      });
    }
  }

  throw new AIToolCallRepairError(
    '',
    attempts,
    toolErrors,
    'Failed to repair tool call'
  );
}
