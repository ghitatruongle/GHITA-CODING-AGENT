// v0.4.9 A5: xAI (Grok) Provider — OpenAI-compatible via defineVendor
// Inspired by LiteLLM's unified provider routing (refer_project/ai-framework/litellm).

import { defineVendor } from './base-extended.js';
import { BaseProvider } from './base.js';
import type { AIProviderType } from '@ghita/shared';

export const XAIProvider = defineVendor(
  {
    type: 'xai' as AIProviderType,
    name: 'xAI (Grok)',
    defaultModel: 'grok-2-latest',
    models: ['grok-2-latest', 'grok-2', 'grok-2-vision-latest', 'grok-beta'],
    chatUrl: 'https://api.x.ai/v1/chat/completions',
    baseUrl: 'https://api.x.ai/v1',
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
