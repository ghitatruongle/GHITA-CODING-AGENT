// ==============================================================================
// GHITA CODING AGENT - Orchestrator Embedding & Media Module
// ==============================================================================
// Embedding, image generation, speech, video, and transcription methods.
// ==============================================================================

import type {
  OrchestratorContext,
  AIProviderType,
  ChatMessage,
  ChatOptions,
  EmbeddingResponse,
  EmbeddingManyResponse,
  GenerateObjectResponse,
} from './types.js';
import { generateObject } from '../utils/structured.js';
import type { z } from 'zod';

/** Generate vector embedding for a text string */
export async function orchestratorEmbed(
  ctx: OrchestratorContext,
  text: string,
  options?: { model?: string; provider?: AIProviderType },
): Promise<EmbeddingResponse> {
  const provider = ctx.resolveProvider(options?.provider);
  const maxAttempts = ctx.config.retryAttempts ?? 2;
  return await ctx.executeWithFallback((p) => p.embed(text, options), provider, maxAttempts);
}

/** Generate vector embeddings for multiple text strings */
export async function orchestratorEmbedMany(
  ctx: OrchestratorContext,
  texts: string[],
  options?: { model?: string; provider?: AIProviderType },
): Promise<EmbeddingManyResponse> {
  const provider = ctx.resolveProvider(options?.provider);
  const maxAttempts = ctx.config.retryAttempts ?? 2;
  return await ctx.executeWithFallback(
    (p) => p.embedMany(texts, options),
    provider,
    maxAttempts,
  );
}

/** Generate structured output according to a Zod schema */
export async function orchestratorGenerateObject<T>(
  _ctx: OrchestratorContext,
  orchestrator: unknown,
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  options?: ChatOptions & { provider?: AIProviderType },
): Promise<GenerateObjectResponse<T>> {
  return generateObject(orchestrator as Parameters<typeof generateObject>[0], schema, messages, options);
}

/** Generate image from text prompt */
export async function orchestratorGenerateImage(
  ctx: OrchestratorContext,
  prompt: string,
  options?: Record<string, unknown> & { provider?: AIProviderType },
): Promise<{ url: string; b64?: string }> {
  const provider = ctx.resolveProvider(options?.provider);
  const maxAttempts = ctx.config.retryAttempts ?? 2;
  return await ctx.executeWithFallback(
    (p) => {
      if (!p.generateImage) throw new Error(`${p.name} does not support generateImage`);
      return p.generateImage(prompt, options);
    },
    provider,
    maxAttempts,
  );
}

/** Generate speech from text */
export async function orchestratorGenerateSpeech(
  ctx: OrchestratorContext,
  text: string,
  options?: Record<string, unknown> & { provider?: AIProviderType },
): Promise<{ audio: Buffer; contentType: string }> {
  const provider = ctx.resolveProvider(options?.provider);
  const maxAttempts = ctx.config.retryAttempts ?? 2;
  return await ctx.executeWithFallback(
    (p) => {
      if (!p.generateSpeech) throw new Error(`${p.name} does not support generateSpeech`);
      return p.generateSpeech(text, options);
    },
    provider,
    maxAttempts,
  );
}

/** Generate video from text prompt */
export async function orchestratorGenerateVideo(
  ctx: OrchestratorContext,
  prompt: string,
  options?: Record<string, unknown> & { provider?: AIProviderType },
): Promise<{ url: string }> {
  const provider = ctx.resolveProvider(options?.provider);
  const maxAttempts = ctx.config.retryAttempts ?? 2;
  return await ctx.executeWithFallback(
    (p) => {
      if (!p.generateVideo) throw new Error(`${p.name} does not support generateVideo`);
      return p.generateVideo(prompt, options);
    },
    provider,
    maxAttempts,
  );
}

/** Transcribe audio to text */
export async function orchestratorTranscribe(
  ctx: OrchestratorContext,
  audio: Buffer,
  options?: Record<string, unknown> & { provider?: AIProviderType },
): Promise<{ text: string }> {
  const provider = ctx.resolveProvider(options?.provider);
  const maxAttempts = ctx.config.retryAttempts ?? 2;
  return await ctx.executeWithFallback(
    (p) => {
      if (!p.transcribe) throw new Error(`${p.name} does not support transcribe`);
      return p.transcribe(audio, options);
    },
    provider,
    maxAttempts,
  );
}
