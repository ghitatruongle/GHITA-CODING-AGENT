---
id: tutorial-first-agent
title: 'Tutorial: Agent đầu tiên'
sidebar_position: 8
---

# Tutorial: Tạo agent đầu tiên

Hướng dẫn tạo một agent đơn giản: nhận input, gọi LLM, trả lời.

## 1. Khởi tạo Agent

```ts
// my-first-agent.ts
import { defineAgent } from '@ghita/agents';
import { openaiProvider } from '@ghita/ai-engine/providers/openai';
import { monitoring } from '@ghita/monitoring';

export default defineAgent({
  id: 'hello-world',
  name: 'Hello World Agent',
  provider: openaiProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  systemPrompt: 'Bạn là trợ lý thân thiện, trả lời ngắn gọn.',
  onError: (err, ctx) => monitoring.captureError(err, ctx),
});
```

## 2. Sử dụng trong app

```ts
import helloAgent from './my-first-agent';

const response = await helloAgent.run({
  messages: [{ role: 'user', content: 'Xin chào!' }],
});

console.log(response.text);
```

## 3. Thêm tools

```ts
import { registerTool } from '@ghita/ai-engine/tools';

registerTool({
  name: 'get_current_time',
  description: 'Trả về thời gian hiện tại',
  input: { type: 'object', properties: {} },
  handler: async () => ({ now: new Date().toISOString() }),
});
```

## 4. Theo dõi quota

```ts
import { QuotaManager } from '@ghita/quotas';

const quotas = new QuotaManager();
const result = quotas.consume('user_123', { inputTokens: 50, outputTokens: 100 });
if (!result.allowed) {
  throw new Error('Quota exceeded, please upgrade to Pro');
}
```

## 5. Capture error & performance

```ts
const tx = monitor.startTransaction('agent.hello-world');
try {
  const res = await helloAgent.run({ messages });
  return res;
} catch (err) {
  monitor.captureError(err, { tags: { agent: 'hello-world' } });
  throw err;
} finally {
  await monitor.finishTransaction(tx!.spanId);
}
```

Xong! Bạn đã có một agent production-ready với monitoring, quota, error tracking.
