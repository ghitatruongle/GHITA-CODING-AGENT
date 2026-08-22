---
id: multi-modal
title: Multi-modal
sidebar_label: Multi-modal
sidebar_position: 3
---

# Tutorial: Multi-modal

Agent xử lý ảnh, âm thanh, và file PDF.

## Vision

```typescript
import { readFile } from 'node:fs/promises';
import { AnthropicProvider } from '@ghita/ai-engine';

const anthropic = new AnthropicProvider({ type: 'anthropic', apiKey: '...' });

const imageBuffer = await readFile('screenshot.png');
const base64 = imageBuffer.toString('base64');

const response = await anthropic.chat(
  [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Mô tả ảnh này' },
        { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: base64 } },
      ],
    },
  ],
  { model: 'claude-3-5-sonnet' },
);

console.log(response.content);
```

## Audio (Whisper)

```typescript
import { OpenAIProvider } from '@ghita/ai-engine';

const openai = new OpenAIProvider({ type: 'openai', apiKey: '...' });

const transcript = await openai.transcribe({
  file: await readFile('meeting.mp3'),
  language: 'vi',
});
```

## PDF parsing

```typescript
import { KnowledgeEngine } from '@ghita/memory';
import { readFile } from 'node:fs/promises';

const kg = new KnowledgeEngine({ embed: openai.embed.bind(openai) });
const pdfBuffer = await readFile('whitepaper.pdf');

await kg.ingest({
  type: 'pdf',
  content: pdfBuffer,
  metadata: { source: 'whitepaper' },
});

const answer = await kg.search('What is the architecture?');
```
