# @ghita/integration

![Version](https://img.shields.io/badge/version-0.1.0-blue)

Cross-package integration layer that wires together the GHITA monorepo packages, providing unified APIs, middleware chaining, and inter-package event bus.

## Key Features

- **Unified API facade** -- single entry point that composes agents, AI engine, skills, and memory.
- **Middleware chaining** -- pluggable request/response middleware for cross-cutting concerns.
- **Event bus** -- typed pub/sub system for inter-package communication without direct imports.
- **Plugin adapters** -- standardized adapter pattern for wrapping external services.
- **Bootstrapping orchestration** -- controlled initialization respecting package dependency order.

## Installation

```bash
pnpm install --filter @ghita/integration
```

## Usage

```typescript
import { IntegrationBus } from '@ghita/integration';

const bus = new IntegrationBus();
bus.on('agent:ready', (agent) => bus.dispatch('memory:warmup', { agentId: agent.id }));
```

## API Docs

Generated via TypeDoc: `pnpm build:docs`
