---
id: packages-ai-engine
title: @ghita/ai-engine
sidebar_label: ai-engine
---

# @ghita/ai-engine

Core AI engine: 30+ providers, routing, cache, batch, load balancer.

## High-level API

```typescript
import {
  Agent,
  defineVendor,
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
  // ...
} from '@ghita/ai-engine';
```

## Sub-modules

- `ai-engine/cache` (Phase 26) — response cache
- `ai-engine/batch` (Phase 27) — request batching
- `ai-engine/loadbalancer` (Phase 28) — load balancer
- `ai-engine/routing` — smart router
- `ai-engine/orchestrator` — multi-provider orchestrator

## Định nghĩa 1 provider mới

```typescript
import { defineVendor } from '@ghita/ai-engine';

export const MyProvider = defineVendor({
  type: 'my-provider',
  name: 'My Provider',
  defaultModel: 'my-model',
  models: ['my-model'],
  chatUrl: 'https://api.example.com/v1/chat/completions',
  authScheme: 'bearer',
  streaming: true,
  capabilities: { /* ... */ },
});
```
