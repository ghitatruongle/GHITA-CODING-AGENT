// ==============================================================================
// v0.4.9 A5: OpenRouter Provider — OpenAI-compatible via defineVendor
// Aggregator routing to 100+ upstream models (refer_project/ai-framework/litellm).
// ==============================================================================

import { defineVendor } from './base-extended.js';
import { BaseProvider } from './base.js';
import type { AIProviderType } from '@ghita/shared';

export const OpenRouterProvider = defineVendor(
  {
    type: 'openrouter' as AIProviderType,
    name: 'OpenRouter',
    defaultModel: 'openrouter/auto',
    models: [
      'openrouter/auto',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-70b-instruct',
    ],
    chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
    baseUrl: 'https://openrouter.ai/api/v1',
    authScheme: 'bearer',
    streaming: true,
    capabilities: {
      streaming: true,
      embeddings: false,
      imageGeneration: false,
      speechSynthesis: false,
      speechRecognition: false,
      videoGeneration: false,
      functionCalling: true,
      visionInput: true,
      reasoningTokens: false,
    },
  },
  BaseProvider,
);
