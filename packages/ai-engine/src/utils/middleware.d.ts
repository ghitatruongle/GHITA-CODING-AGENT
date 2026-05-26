import type { AIProvider, ChatMessage, ChatOptions, ChatResponse, EmbeddingManyResponse, EmbeddingResponse } from '../types.js';
import type { AIStreamChunk } from '@ghita/shared';
export type MiddlewareNext<T> = (messages?: ChatMessage[], options?: ChatOptions) => Promise<T>;
export type ChatMiddleware = (params: {
    messages: ChatMessage[];
    options?: ChatOptions;
    provider: AIProvider;
}, next: MiddlewareNext<ChatResponse>) => Promise<ChatResponse>;
export type ChatStreamMiddleware = (params: {
    messages: ChatMessage[];
    options?: ChatOptions;
    provider: AIProvider;
}, next: MiddlewareNext<AsyncGenerator<AIStreamChunk>>) => Promise<AsyncGenerator<AIStreamChunk>>;
export interface IMiddlewareChain {
    chat: ChatMiddleware[];
    chatStream: ChatStreamMiddleware[];
}
/**
 * Creates a proxy wrapped around a provider that intercepts chat() and chatStream()
 * calls through composed middleware chains.
 */
export declare function wrapLanguageModel(provider: AIProvider, middlewares: IMiddlewareChain): AIProvider;
/**
 * Helper to dynamically compose arrays of middlewares into a single execution function.
 */
export declare function composeMiddlewares<T>(middlewares: Array<(params: any, next: (params?: any) => Promise<T>) => Promise<T>>, baseCall: (params: any) => Promise<T>): (params: any) => Promise<T>;
export type EmbeddingMiddleware = (params: {
    text: string;
    options?: {
        model?: string;
    };
    provider: AIProvider;
}, next: (text?: string, options?: {
    model?: string;
}) => Promise<EmbeddingResponse>) => Promise<EmbeddingResponse>;
export type EmbeddingManyMiddleware = (params: {
    texts: string[];
    options?: {
        model?: string;
    };
    provider: AIProvider;
}, next: (texts?: string[], options?: {
    model?: string;
}) => Promise<EmbeddingManyResponse>) => Promise<EmbeddingManyResponse>;
export type ImageMiddleware = (params: {
    prompt: string;
    options?: any;
    provider: any;
}, next: (prompt?: string, options?: any) => Promise<any>) => Promise<any>;
/**
 * Wraps embedding models (embed, embedMany) of a provider with middleware chains.
 */
export declare function wrapEmbeddingModel(provider: AIProvider, middlewares: {
    embed?: EmbeddingMiddleware[];
    embedMany?: EmbeddingManyMiddleware[];
}): AIProvider;
/**
 * Wraps an image model (generateImage) with image middleware chains.
 */
export declare function wrapImageModel(imageModel: {
    generateImage: (prompt: string, options?: any) => Promise<any>;
    [key: string]: any;
}, middlewares: ImageMiddleware[]): any;
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
export declare function wrapProvider(provider: AIProvider, middlewares: IProviderMiddlewares): AIProvider;
//# sourceMappingURL=middleware.d.ts.map