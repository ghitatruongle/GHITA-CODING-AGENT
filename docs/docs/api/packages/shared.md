---
id: packages-shared
title: @ghita/shared
sidebar_label: shared
---

# @ghita/shared

Types, constants, utilities dùng chung cho mọi package.

## Exports chính

```typescript
import type { AIProviderType, ChatMessage, ChatResponse } from '@ghita/shared';
import { AI_PROVIDERS, GHITA_VERSION } from '@ghita/shared';
```

## Types

- `AIProviderType` — union 30+ provider IDs
- `ChatMessage` — system/user/assistant/tool message
- `ChatResponse` — content + usage + finishReason
- `ChatOptions` — model, temperature, maxTokens, ...
- `AIStreamChunk` — incremental chunk cho streaming

## Constants

- `AI_PROVIDERS` — metadata cho từng provider
- `GHITA_VERSION` — version hiện tại (0.0.3)
