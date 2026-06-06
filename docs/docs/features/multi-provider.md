---
id: multi-provider
title: Multi-provider
sidebar_label: Multi-provider
sidebar_position: 1
---

# Multi-provider support

GHITA hỗ trợ **30+ LLM providers** thông qua cùng 1 interface.

## Danh sách providers

| Provider | Native | OpenAI-compat | Streaming | Embeddings |
|----------|--------|---------------|-----------|------------|
| OpenAI | ✅ | — | ✅ | ✅ |
| Anthropic | ✅ | — | ✅ | ❌ |
| Google AI | ✅ | — | ✅ | ✅ |
| Ollama | — | ✅ | ✅ | ✅ |
| Groq | — | ✅ | ✅ | ❌ |
| DeepSeek | — | ✅ | ✅ | ❌ |
| OpenRouter | — | ✅ | ✅ | ❌ |
| Together | — | ✅ | ✅ | ❌ |
| Fireworks | — | ✅ | ✅ | ❌ |
| Mistral | ✅ | ✅ | ✅ | ✅ |
| xAI (Grok) | — | ✅ | ✅ | ❌ |
| Perplexity | — | ✅ | ✅ | ❌ |
| Cohere | ✅ | — | ✅ | ✅ |
| Replicate | ✅ | — | ✅ | ❌ |
| ... | | | | |

Xem đầy đủ tại `packages/shared/src/constants.ts`.

## Thêm provider mới (vendor pattern)

```typescript
import { defineVendor } from '@ghita/ai-engine';

export const MyVendorProvider = defineVendor({
  type: 'my-vendor',
  name: 'My Vendor',
  defaultModel: 'my-vendor-pro',
  models: ['my-vendor-pro', 'my-vendor-fast'],
  chatUrl: 'https://api.my-vendor.com/v1/chat/completions',
  baseUrl: 'https://api.my-vendor.com/v1',
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
});
```

Phase 6 (`fix-phase6.md`) mô tả chi tiết pattern này.

## Routing

`SmartRouter` (Phase 11) tự động:
- Chọn provider theo task type (chat, embed, image, code, ...)
- Failover nếu provider lỗi
- Load balancing giữa các API key (Phase 28)
