# @ghita/ai-engine

![Version](https://img.shields.io/badge/version-0.1.0-blue)

Multi-provider AI engine that routes requests across LLM backends (OpenAI, Anthropic, Google, local models) with cost-aware load balancing and streaming support.

## Key Features

- **Multi-provider routing** -- transparently dispatch to OpenAI, Anthropic, Gemini, or local models.
- **Cost-aware load balancing** -- per-provider budgets, cost tracking, and automatic fallback on quota exhaustion.
- **Streaming & batching** -- SSE-compatible streaming responses with concurrent batch inference.
- **Context management** -- token budgeting, context window truncation, and conversation history compression.
- **gRPC gateway** -- high-performance internal gateway for inter-service AI communication.

## Installation

```bash
pnpm install --filter @ghita/ai-engine
```

## Usage

```typescript
import { AIEngine, Provider } from '@ghita/ai-engine';

const engine = new AIEngine({ defaultProvider: Provider.OpenAI });
const response = await engine.chat({
  messages: [{ role: 'user', content: 'Explain this code' }],
});
```

## API Docs

Generated via TypeDoc: `pnpm build:docs`
