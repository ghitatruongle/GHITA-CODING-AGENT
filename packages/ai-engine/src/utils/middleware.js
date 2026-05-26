// ==============================================================================
// GHITA CODING AGENT - Middleware Pipeline Pattern
// ==============================================================================
/**
 * Creates a proxy wrapped around a provider that intercepts chat() and chatStream()
 * calls through composed middleware chains.
 */
export function wrapLanguageModel(provider, middlewares) {
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
        chat: async (messages, options) => {
            let index = 0;
            const executeNext = async (currentMessages, currentOptions) => {
                if (index < middlewares.chat.length) {
                    const mw = middlewares.chat[index++];
                    return mw({ messages: currentMessages, options: currentOptions, provider }, (nextMessages, nextOptions) => executeNext(nextMessages ?? currentMessages, nextOptions ?? currentOptions));
                }
                return provider.chat(currentMessages, currentOptions);
            };
            return executeNext(messages, options);
        },
        chatStream: (messages, options) => {
            let index = 0;
            const executeNext = async (currentMessages, currentOptions) => {
                if (index < middlewares.chatStream.length) {
                    const mw = middlewares.chatStream[index++];
                    return mw({ messages: currentMessages, options: currentOptions, provider }, (nextMessages, nextOptions) => executeNext(nextMessages ?? currentMessages, nextOptions ?? currentOptions));
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
export function composeMiddlewares(middlewares, baseCall) {
    return (params) => {
        let index = 0;
        const next = async (currentParams = params) => {
            if (index < middlewares.length) {
                const mw = middlewares[index++];
                return mw(currentParams, (nextParams) => next(nextParams ?? currentParams));
            }
            return baseCall(currentParams);
        };
        return next(params);
    };
}
/**
 * Wraps embedding models (embed, embedMany) of a provider with middleware chains.
 */
export function wrapEmbeddingModel(provider, middlewares) {
    return {
        ...provider,
        embed: async (text, options) => {
            const embedMws = middlewares.embed || [];
            let index = 0;
            const executeNext = async (currentText, currentOptions) => {
                if (index < embedMws.length) {
                    const mw = embedMws[index++];
                    return mw({ text: currentText, options: currentOptions, provider }, (nextText, nextOptions) => executeNext(nextText ?? currentText, nextOptions ?? currentOptions));
                }
                return provider.embed(currentText, currentOptions);
            };
            return executeNext(text, options);
        },
        embedMany: async (texts, options) => {
            const embedManyMws = middlewares.embedMany || [];
            let index = 0;
            const executeNext = async (currentTexts, currentOptions) => {
                if (index < embedManyMws.length) {
                    const mw = embedManyMws[index++];
                    return mw({ texts: currentTexts, options: currentOptions, provider }, (nextTexts, nextOptions) => executeNext(nextTexts ?? currentTexts, nextOptions ?? currentOptions));
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
export function wrapImageModel(imageModel, middlewares) {
    return {
        ...imageModel,
        generateImage: async (prompt, options) => {
            let index = 0;
            const executeNext = async (currentPrompt, currentOptions) => {
                if (index < middlewares.length) {
                    const mw = middlewares[index++];
                    return mw({ prompt: currentPrompt, options: currentOptions, provider: imageModel }, (nextPrompt, nextOptions) => executeNext(nextPrompt ?? currentPrompt, nextOptions ?? currentOptions));
                }
                return imageModel.generateImage(currentPrompt, currentOptions);
            };
            return executeNext(prompt, options);
        }
    };
}
/**
 * Higher-level wrapper to apply middleware across all features of a provider.
 */
export function wrapProvider(provider, middlewares) {
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
    if (typeof provider.generateImage === 'function') {
        const wrappedImage = wrapImageModel(provider, middlewares.image || []);
        wrapped.generateImage = wrappedImage.generateImage;
    }
    return wrapped;
}
//# sourceMappingURL=middleware.js.map