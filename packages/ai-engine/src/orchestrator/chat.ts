// Chat completion and streaming with semantic cache, fallback, and retry logic.

import { sleep } from '@ghita/shared';
import type { AIStreamChunk } from '@ghita/shared';
import type {
  OrchestratorContext,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  AIProviderType,
} from './types.js';
import { stableMessageKey } from './helpers.js';

/** Auth/validation failures must never be retried — retrying cannot fix them
 * and only burns budget. Network/5xx/429-style failures are retryable. */
function isRetryableStreamError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return !/\b(400|401|403|404|422)\b/.test(msg)
    && !/unauthorized|forbidden|invalid[ _-]api[ _-]?key|authentication|permission/i.test(msg);
}

/** Chat with provider priority, fallback on error */
export async function orchestratorChat(
  ctx: OrchestratorContext,
  messages: ChatMessage[],
  options?: ChatOptions & { provider?: AIProviderType },
): Promise<ChatResponse> {
  const cacheKey = await stableMessageKey(messages);

  try {
    const cached = await ctx.semanticCache.get(cacheKey);
    if (cached) {
      return cached as ChatResponse;
    }
  } catch (err) {
    console.warn('[SemanticCache] get error:', err);
  }

  const provider = ctx.resolveProvider(options?.provider, options?.agentRole);
  ctx.budgetManager.checkBudget(0);

  const maxAttempts = ctx.config.retryAttempts ?? 2;

  const response = await ctx.executeWithFallback(
    (p) => p.chat(messages, options),
    provider,
    maxAttempts,
  );

  try {
    await ctx.semanticCache.set(cacheKey, response);
  } catch (err) {
    console.warn('[SemanticCache] set error:', err);
  }

  return response;
}

/** Streaming chat with provider priority, fallback on error */
export async function* orchestratorChatStream(
  ctx: OrchestratorContext,
  messages: ChatMessage[],
  options?: ChatOptions & { provider?: AIProviderType },
): AsyncGenerator<AIStreamChunk> {
  const cacheKey = await stableMessageKey(messages);

  try {
    const cached = (await ctx.semanticCache.get(cacheKey)) as ChatResponse | null;
    if (cached) {
      yield {
        content: cached.content,
        done: true,
        provider: cached.provider,
        model: cached.model,
        usage: cached.usage,
      };
      return;
    }
  } catch (err) {
    console.warn('[SemanticCache] get stream error:', err);
  }

  const provider = ctx.resolveProvider(options?.provider, options?.agentRole);
  ctx.budgetManager.checkBudget(0);

  const maxAttempts = ctx.config.retryAttempts ?? 2;
  let accumulatedContent = '';
  let resolvedProvider = provider.type;
  let resolvedModel = options?.model || provider.defaultModel || 'default';
  let finalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let finalFinishReason: 'stop' | 'length' | 'error' | 'aborted' | undefined;
  let success = false;
  let lastError: Error | undefined;
  // Once any chunk of the current response reached the consumer, restarting
  // the stream (retry or fallback) would REPLAY that prefix — so we surface a
  // partial + error instead of duplicating output.
  let everEmitted = false;

  for (let attempt = 1; attempt <= maxAttempts && !success; attempt++) {
    let emittedThisAttempt = false;
    try {
      accumulatedContent = '';
      const stream = provider.chatStream(messages, options);
      for await (const chunk of stream) {
        emittedThisAttempt = true;
        everEmitted = true;
        accumulatedContent += chunk.content;
        if (chunk.provider) resolvedProvider = chunk.provider;
        if (chunk.model) resolvedModel = chunk.model;
        if (chunk.usage) {
          finalUsage = {
            promptTokens: chunk.usage.promptTokens,
            completionTokens: chunk.usage.completionTokens,
            totalTokens: chunk.usage.totalTokens,
          };
        }
        const fr = (chunk as { finishReason?: typeof finalFinishReason }).finishReason;
        if (fr) finalFinishReason = fr;
        yield chunk;
      }
      success = true;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (options?.signal?.aborted) {
        if (emittedThisAttempt) {
          yield {
            content: '',
            role: 'assistant' as const,
            provider: resolvedProvider,
            model: resolvedModel,
            finishReason: 'error',
            partialContent: accumulatedContent,
          } as unknown as AIStreamChunk;
        }
        throw lastError;
      }
      if (emittedThisAttempt) {
        yield {
          content: '',
          role: 'assistant' as const,
          provider: resolvedProvider,
          model: resolvedModel,
          finishReason: 'error',
          partialContent: accumulatedContent,
        } as unknown as AIStreamChunk;
        throw lastError;
      }
      if (!isRetryableStreamError(lastError)) throw lastError;
      if (attempt < maxAttempts) {
        // Linear backoff with jitter — never a fixed sleep.
        const base = ctx.config.retryDelayMs ?? 1000;
        await sleep(base * attempt + Math.floor(Math.random() * 250));
      }
    }
  }

  if (!success) {
    if (everEmitted) {
      // A previous attempt already streamed content — falling back would
      // duplicate it in the consumer's transcript.
      throw lastError;
    }
    const fallback = ctx.findFallbackProvider(provider.type);
    if (fallback) {
      try {
        accumulatedContent = '';
        resolvedProvider = fallback.type;
        resolvedModel = options?.model || fallback.defaultModel || 'default';
        const stream = fallback.chatStream(messages, options);
        for await (const chunk of stream) {
          accumulatedContent += chunk.content;
          if (chunk.provider) resolvedProvider = chunk.provider;
          if (chunk.model) resolvedModel = chunk.model;
          if (chunk.usage) {
            finalUsage = {
              promptTokens: chunk.usage.promptTokens,
              completionTokens: chunk.usage.completionTokens,
              totalTokens: chunk.usage.totalTokens,
            };
          }
          const fr = (chunk as { finishReason?: typeof finalFinishReason }).finishReason;
        if (fr) finalFinishReason = fr;
          yield chunk;
        }
        success = true;
      } catch (err) {
        const newMsg = err instanceof Error ? err.message : String(err);
        const oldMsg = lastError?.message ?? '';
        if (newMsg !== oldMsg) {
          console.warn('[Fallback Provider] stream error:', err);
        }
        if (accumulatedContent) {
          yield {
            content: '',
            role: 'assistant' as const,
            provider: resolvedProvider,
            model: resolvedModel,
            finishReason: 'error',
            partialContent: accumulatedContent,
          } as unknown as AIStreamChunk;
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    } else {
      throw lastError;
    }
  }

  // Cache the fully compiled response with the REAL finish reason so a
  // length-capped or tool-calling answer is not replayed as a plain stop.
  const completeResponse: ChatResponse = {
    content: accumulatedContent,
    model: resolvedModel,
    provider: resolvedProvider,
    usage: finalUsage,
    finishReason: finalFinishReason ?? 'stop',
  };

  try {
    await ctx.semanticCache.set(cacheKey, completeResponse);
  } catch (err) {
    console.warn('[SemanticCache] set stream error:', err);
  }
}
