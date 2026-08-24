import { defineVendor } from './base-extended.js';
import { BaseProvider } from './base.js';
import type { AIProviderType } from '@ghita/shared';

export const MiniMaxProvider = defineVendor(
  {
    type: 'minimax' as AIProviderType,
    name: 'MiniMax',
    defaultModel: 'minimax-v1',
    models: ['minimax-v1', 'minimax-v1-128k'],
    chatUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    baseUrl: 'https://api.minimax.chat/v1',
    authScheme: 'bearer',
    authHeader: 'Authorization',
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
      reasoningTokens: true,
    },
  },
  BaseProvider,
);
