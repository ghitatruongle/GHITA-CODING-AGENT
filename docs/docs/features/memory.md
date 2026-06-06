---
id: memory
title: Memory
sidebar_label: Memory
sidebar_position: 4
---

# Memory Layer

Hệ thống memory dài hạn cho agent: lưu trữ, tìm kiếm, và recall context liên quan.

## Components

- **AgentMemory** — facade chính
- **TieredMemoryStore** — phân tầng hot/warm/cold
- **KnowledgeEngine** — RAG với embeddings
- **KnowledgeGraph** — entity-relation graph
- **CrossSessionSearch** — tìm kiếm xuyên session
- **MemoryNudgeEngine** — gợi ý auto-save
- **MemoryCompactor** (Phase 14) — gộp entries cũ
- **MemoryFreshnessTracker** (Phase 22) — decay score
- **MemoryCompression** (Phase 30) — tier-based compression

## Sử dụng

```typescript
import { AgentMemory } from '@ghita/memory';

const memory = new AgentMemory();

// Save
memory.remember({
  type: 'preference',
  content: 'User prefers TypeScript over JavaScript',
  metadata: { source: 'chat', sessionId: 's1' },
});

// Recall
const results = memory.search('TypeScript', { limit: 5 });
for (const r of results) {
  console.log(`[${r.entry.type}] ${r.entry.content}`);
}

// Inject vào prompt
const context = memory.injectContext('TypeScript', {
  maxCharacters: 2000,
});
```

## Knowledge Graph

```typescript
import { KnowledgeEngine } from '@ghita/memory';

const kg = new KnowledgeEngine({
  embed: async (text) => await openai.embed(text),
});

await kg.ingest({ type: 'file', path: './README.md' });
const results = await kg.search('getting started', { limit: 10 });
```
