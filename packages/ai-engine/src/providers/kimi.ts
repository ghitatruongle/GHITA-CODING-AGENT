import { defineVendor } from './base-extended.js';
import { BaseProvider } from './base.js';
import type { AIProviderType } from '@ghita/shared';

export const KimiProvider = defineVendor(
  {
    type: 'kimi' as AIProviderType,
    name: 'Kimi (Moonshot AI)',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    chatUrl: 'https://api.moonshot.cn/v1/chat/completions',
    baseUrl: 'https://api.moonshot.cn/v1',
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
      visionInput: false,
      reasoningTokens: false,
    },
  },
  BaseProvider,
);
