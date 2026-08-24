import { defineVendor } from './base-extended.js';
import { BaseProvider } from './base.js';

export const DeepSeekProvider = defineVendor(
  {
    type: 'deepseek',
    name: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    chatUrl: 'https://api.deepseek.com/v1/chat/completions',
    baseUrl: 'https://api.deepseek.com/v1',
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
      reasoningTokens: true,
    },
  },
  BaseProvider,
);
