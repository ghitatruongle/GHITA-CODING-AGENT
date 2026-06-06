---
id: packages-memory
title: @ghita/memory
sidebar_label: memory
---

# @ghita/memory

Memory layer: long-term storage, RAG, knowledge graph, compression.

## API chính

```typescript
import {
  AgentMemory,
  KnowledgeEngine,
  KnowledgeGraph,
  TieredMemoryStore,
  MemoryNudgeEngine,
  MemoryCompactor,
  MemoryFreshnessTracker,
  MemoryCompression, // Phase 30
} from '@ghita/memory';
```

## Sub-modules

- `memory/knowledge` (Phase 4) — RAG
- `memory/guardrail` (Phase 4) — LLM guardrail
- `memory/graph` (Phase 4) — knowledge graph
- `memory/semantic` (Phase 14/19) — compact, FTS5, Rust addon
- `memory/freshness` (Phase 22) — decay tracker
- `memory/compression` (Phase 30) — tier-based compression
