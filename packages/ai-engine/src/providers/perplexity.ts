// v0.4.9 A5: Perplexity Provider — OpenAI-compatible via defineVendor
// Online search-augmented models (refer_project/ai-framework/litellm pattern).

import { defineVendor } from './base-extended.js';
import { BaseProvider } from './base.js';
import type { AIProviderType } from '@ghita/shared';

export const PerplexityProvider = defineVendor(
  {
    type: 'perplexity' as AIProviderType,
    name: 'Perplexity',
    defaultModel: 'sonar',
    models: ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro'],
    chatUrl: 'https://api.perplexity.ai/chat/completions',
    baseUrl: 'https://api.perplexity.ai',
    authScheme: 'bearer',
    streaming: true,
    capabilities: {
      streaming: true,
      embeddings: false,
      imageGeneration: false,
      speechSynthesis: false,
      speechRecognition: false,
      videoGeneration: false,
      functionCalling: false,
      visionInput: false,
      reasoningTokens: true,
    },
  },
  BaseProvider,
);
