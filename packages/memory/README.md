# @ghita/memory

![Version](https://img.shields.io/badge/version-0.1.0-blue)

Agent memory system for GHITA Coding Agent -- semantic search, knowledge graph, session compression, and tiered storage for persistent context across conversations.

## Key Features

- **Semantic search** -- vector-based retrieval for finding relevant past context.
- **Knowledge graph** -- persistent entity and relationship store for long-term facts.
- **Session compression** -- summarizes conversation history to fit within token budgets.
- **Tiered storage** -- hot (in-memory), warm (SQLite), and cold (file) memory tiers.
- **Freshness scoring** -- decays memory relevance over time to prioritize recent information.

## Installation

```bash
pnpm install --filter @ghita/memory
```

## Usage

```typescript
import { MemoryStore } from '@ghita/memory';

const store = new MemoryStore();
await store.save({ key: 'project:ghita', value: 'TypeScript monorepo' });
const results = await store.search('monorepo structure');
```

## API Docs

Generated via TypeDoc: `pnpm build:docs`
