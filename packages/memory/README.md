# @ghita/memory

![Version](https://img.shields.io/badge/version-0.1.5-blue)
![Coverage](https://img.shields.io/badge/coverage-53%25_lines-yellow)
![Tier](https://img.shields.io/badge/tier-T1_core-orange)

Tiered agent memory: working memory, session store, vector embeddings, graph associations, and PII guardrails.

## Install

```bash
pnpm --filter @ghita/memory build
pnpm --filter @ghita/memory test
```

## Core modules

| Module                          | Responsibility                      |
| ------------------------------- | ----------------------------------- |
| `TieredMemoryStore`             | hot/warm/cold promotion + eviction  |
| `getDeterministicMockEmbedding` | offline embedding fixture for tests |
| `graph/path`                    | BFS / Dijkstra association paths    |
| `guardrail`                     | PII scan for memory content         |
| `session`                       | session lifecycle                   |

## Usage

```ts
import { TieredMemoryStore, getDeterministicMockEmbedding } from '@ghita/memory';
import { createAssociationList, addAssociation, findConnectionPath } from '@ghita/memory';

const store = new TieredMemoryStore({ maxWorkingMemorySize: 50 });
store.add({
  id: 'm1',
  type: 'note',
  content: 'user prefers pnpm',
  timestamp: Date.now(),
} as never);

const vec = getDeterministicMockEmbedding('hello', 32);

const g = createAssociationList();
addAssociation(g, { from: 'a', to: 'b', type: 'related-to' });
findConnectionPath(g, 'a', 'b');
```

## Security notes

- Guardrail package redacts sensitive patterns before long-term storage.
- Coverage floor: **≥50% lines**.

## Test

```bash
pnpm --filter @ghita/memory exec vitest run --coverage
```
