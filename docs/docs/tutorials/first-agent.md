---
id: first-agent
title: First Agent
sidebar_label: First Agent
sidebar_position: 1
---

# Tutorial: First Agent

Build 1 agent đơn giản đọc 1 file, summarize, và lưu vào memory.

## Bước 1: Khởi tạo

```bash
mkdir my-first-agent && cd my-first-agent
pnpm init
pnpm add @ghita/agents @ghita/ai-engine @ghita/memory
```

## Bước 2: Code

```typescript
// index.ts
import { Agent } from '@ghita/agents';
import { OpenAIProvider } from '@ghita/ai-engine';
import { AgentMemory } from '@ghita/memory';
import { readFile } from 'node:fs/promises';

async function main() {
  const provider = new OpenAIProvider({
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
  });

  const memory = new AgentMemory();
  const agent = new Agent({ provider, memory });

  const filePath = process.argv[2];
  const content = await readFile(filePath, 'utf-8');

  const summary = await agent.run(
    `Summarize the following file in 3 bullet points:\n\n${content}`,
  );

  console.log('Summary:', summary);
  memory.remember({
    type: 'note',
    content: `Summary of ${filePath}: ${summary}`,
    metadata: { filePath },
  });
}

main().catch(console.error);
```

## Bước 3: Run

```bash
export OPENAI_API_KEY=sk-...
npx tsx index.ts README.md
```

Output:
```
Summary:
- GHITA là desktop AI agent...
- Multi-provider (30+ LLMs)...
- Local-first...
```
