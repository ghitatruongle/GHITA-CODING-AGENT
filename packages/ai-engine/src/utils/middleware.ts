// ==============================================================================
// GHITA CODING AGENT - Middleware Pipeline Pattern
// ==============================================================================

import type { AIProvider, ChatMessage, ChatOptions, ChatResponse, EmbeddingManyResponse, EmbeddingResponse } from '../types.js';
import type { AIStreamChunk } from '@ghita/shared';

export type MiddlewareNext<T> = (messages?: ChatMessage[], options?: ChatOptions) => Promise<T>;

export type ChatMiddleware = (
  params: { messages: ChatMessage[]; options?: ChatOptions; provider: AIProvider },
  next: MiddlewareNext<ChatResponse>
) => Promise<ChatResponse>;

export type ChatStreamMiddleware = (
  params: { messages: ChatMessage[]; options?: ChatOptions; provider: AIProvider },
  next: MiddlewareNext<AsyncGenerator<AIStreamChunk>>
) => Promise<AsyncGenerator<AIStreamChunk>>;

export interface IMiddlewareChain {
  chat: ChatMiddleware[];
  chatStream: ChatStreamMiddleware[];
}

/**
 * Creates a proxy wrapped around a provider that intercepts chat() and chatStream()
 * calls through composed middleware chains.
 */
export function wrapLanguageModel(
  provider: AIProvider,
  middlewares: IMiddlewareChain
): AIProvider {
  return {
    ...provider,

    // Proxy getters
    get type() { return provider.type; },
    get name() { return provider.name; },
    get defaultModel() { return provider.defaultModel; },
    get models() { return provider.models; },

    // Proxy other methods
    isReady: () => provider.isReady(),
    test: () => provider.test(),
    embed: (text, options) => provider.embed(text, options),
    embedMany: (texts, options) => provider.embedMany(texts, options),

    chat: async (messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> => {
      let index = 0;
      
      const executeNext = async (
        currentMessages: ChatMessage[],
        currentOptions?: ChatOptions
      ): Promise<ChatResponse> => {
        if (index < middlewares.chat.length) {
          const mw = middlewares.chat[index];
      if (!mw) return provider.chat(currentMessages, currentOptions);
      index++;
          return mw(
            { messages: currentMessages, options: currentOptions, provider },
            (nextMessages, nextOptions) =>
              executeNext(nextMessages ?? currentMessages, nextOptions ?? currentOptions)
          );
        }
        return provider.chat(currentMessages, currentOptions);
      };

      return executeNext(messages, options);
    },

    chatStream: (messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk> => {
      let index = 0;

      const executeNext = async (
        currentMessages: ChatMessage[],
        currentOptions?: ChatOptions
      ): Promise<AsyncGenerator<AIStreamChunk>> => {
  if (index < middlewares.chatStream.length) {
    const mw = middlewares.chatStream[index];
    if (!mw) return provider.chatStream(currentMessages, currentOptions);
    index++;
          return mw(
            { messages: currentMessages, options: currentOptions, provider },
            (nextMessages, nextOptions) =>
              executeNext(nextMessages ?? currentMessages, nextOptions ?? currentOptions)
          );
        }
        return provider.chatStream(currentMessages, currentOptions);
      };

      const composedGenPromise = executeNext(messages, options);

      return (async function* () {
        const gen = await composedGenPromise;
        for await (const chunk of gen) {
          yield chunk;
        }
      })();
    }
  };
}

/**
 * Helper to dynamically compose arrays of middlewares into a single execution function.
 */
export function composeMiddlewares<T>(
  middlewares: Array<(params: Record<string, unknown>, next: (params?: Record<string, unknown>) => Promise<T>) => Promise<T>>,
  baseCall: (params: Record<string, unknown>) => Promise<T>
): (params: Record<string, unknown>) => Promise<T> {
  return (params: Record<string, unknown>) => {
    let index = 0;

    const next = async (currentParams: Record<string, unknown> = params): Promise<T> => {
      if (index < middlewares.length) {
        const mw = middlewares[index];
if (!mw) return baseCall(currentParams);
      index++;
      return mw(currentParams, (nextParams) => next(nextParams ?? currentParams));
      }
      return baseCall(currentParams);
    };

    return next(params);
  };
}

// ------------------------------------------------------------------------------
// 2.8 Middleware for Embedding + Image
// ------------------------------------------------------------------------------

export type EmbeddingMiddleware = (
  params: { text: string; options?: { model?: string }; provider: AIProvider },
  next: (text?: string, options?: { model?: string }) => Promise<EmbeddingResponse>
) => Promise<EmbeddingResponse>;

export type EmbeddingManyMiddleware = (
  params: { texts: string[]; options?: { model?: string }; provider: AIProvider },
  next: (texts?: string[], options?: { model?: string }) => Promise<EmbeddingManyResponse>
) => Promise<EmbeddingManyResponse>;

export type ImageMiddleware = (
  params: { prompt: string; options?: Record<string, unknown>; provider: Record<string, unknown> },
  next: (prompt?: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>
) => Promise<Record<string, unknown>>;

/**
 * Wraps embedding models (embed, embedMany) of a provider with middleware chains.
 */
export function wrapEmbeddingModel(
  provider: AIProvider,
  middlewares: {
    embed?: EmbeddingMiddleware[];
    embedMany?: EmbeddingManyMiddleware[];
  }
): AIProvider {
  return {
    ...provider,

    embed: async (text: string, options?: { model?: string }): Promise<EmbeddingResponse> => {
      const embedMws = middlewares.embed || [];
      let index = 0;

      const executeNext = async (currentText: string, currentOptions?: { model?: string }): Promise<EmbeddingResponse> => {
  if (index < embedMws.length) {
    const mw = embedMws[index];
    if (!mw) return provider.embed(currentText, currentOptions);
    index++;
          return mw(
            { text: currentText, options: currentOptions, provider },
            (nextText, nextOptions) => executeNext(nextText ?? currentText, nextOptions ?? currentOptions)
          );
        }
        return provider.embed(currentText, currentOptions);
      };

      return executeNext(text, options);
    },

    embedMany: async (texts: string[], options?: { model?: string }): Promise<EmbeddingManyResponse> => {
      const embedManyMws = middlewares.embedMany || [];
      let index = 0;

      const executeNext = async (currentTexts: string[], currentOptions?: { model?: string }): Promise<EmbeddingManyResponse> => {
  if (index < embedManyMws.length) {
    const mw = embedManyMws[index];
    if (!mw) return provider.embedMany(currentTexts, currentOptions);
    index++;
          return mw(
            { texts: currentTexts, options: currentOptions, provider },
            (nextTexts, nextOptions) => executeNext(nextTexts ?? currentTexts, nextOptions ?? currentOptions)
          );
        }
        return provider.embedMany(currentTexts, currentOptions);
      };

      return executeNext(texts, options);
    }
  };
}

/**
 * Wraps an image model (generateImage) with image middleware chains.
 */
export function wrapImageModel(
  imageModel: { generateImage: (prompt: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>; [key: string]: unknown },
  middlewares: ImageMiddleware[]
): Record<string, unknown> {
  return {
    ...imageModel,

    generateImage: async (prompt: string, options?: Record<string, unknown>): Promise<Record<string, unknown>> => {
      let index = 0;

      const executeNext = async (currentPrompt: string, currentOptions?: Record<string, unknown>): Promise<Record<string, unknown>> => {
  if (index < middlewares.length) {
    const mw = middlewares[index];
    if (!mw) return imageModel.generateImage(currentPrompt, currentOptions);
    index++;
          return mw(
            { prompt: currentPrompt, options: currentOptions, provider: imageModel },
            (nextPrompt, nextOptions) => executeNext(nextPrompt ?? currentPrompt, nextOptions ?? currentOptions)
          );
        }
        return imageModel.generateImage(currentPrompt, currentOptions);
      };

      return executeNext(prompt, options);
    }
  };
}

// ------------------------------------------------------------------------------
// 2.7 Provider Wrapper
// ------------------------------------------------------------------------------

export interface IProviderMiddlewares {
  chat?: ChatMiddleware[];
  chatStream?: ChatStreamMiddleware[];
  embed?: EmbeddingMiddleware[];
  embedMany?: EmbeddingManyMiddleware[];
  image?: ImageMiddleware[];
}

/**
 * Higher-level wrapper to apply middleware across all features of a provider.
 */
export function wrapProvider(
  provider: AIProvider,
  middlewares: IProviderMiddlewares
): AIProvider {
  // Wrap chat & chatStream
  let wrapped = wrapLanguageModel(provider, {
    chat: middlewares.chat || [],
    chatStream: middlewares.chatStream || []
  });

  // Wrap embedding
  wrapped = wrapEmbeddingModel(wrapped, {
    embed: middlewares.embed || [],
    embedMany: middlewares.embedMany || []
  });

// Future proof: if the provider has a generateImage method, wrap it
const providerRecord = provider as unknown as Record<string, unknown>;
if (typeof providerRecord.generateImage === 'function') {
  const imageModel = provider as unknown as Parameters<typeof wrapImageModel>[0];
  const wrappedImage = wrapImageModel(imageModel, middlewares.image || []);
  (wrapped as unknown as Record<string, unknown>).generateImage = wrappedImage.generateImage;
  }

  return wrapped;
}
