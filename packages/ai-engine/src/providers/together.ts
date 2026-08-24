// v0.4.9 A5: Together AI Provider — OpenAI-compatible via defineVendor
// Open-model inference (refer_project/ai-framework/litellm routing pattern).

import { defineVendor } from './base-extended.js';
import { BaseProvider } from './base.js';
import type { AIProviderType } from '@ghita/shared';

export const TogetherProvider = defineVendor(
  {
    type: 'together' as AIProviderType,
    name: 'Together AI',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
      'Qwen/Qwen2.5-72B-Instruct-Turbo',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
    ],
    chatUrl: 'https://api.together.xyz/v1/chat/completions',
    baseUrl: 'https://api.together.xyz/v1',
    authScheme: 'bearer',
    streaming: true,
    capabilities: {
      streaming: true,
      embeddings: true,
      imageGeneration: false,
      speechSynthesis: false,
      speechRecognition: false,
      videoGeneration: false,
      functionCalling: true,
      visionInput: false,
      reasoningTokens: false,
    },
  },
  BaseProvider,
);
