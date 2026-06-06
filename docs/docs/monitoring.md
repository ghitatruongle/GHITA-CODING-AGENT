---
id: monitoring
title: Monitoring
sidebar_label: Monitoring
sidebar_position: 2
---

# Monitoring

`@ghita/monitoring` (Phase 32) cung cấp:

- **Sentry transport** (graceful fallback khi chưa cài `@sentry/node`)
- **Error grouping & dedup**
- **Performance tracing** (transaction/span)
- **Alert rules** (threshold + cooldown)

## Setup

```typescript
import { ErrorMonitor } from '@ghita/monitoring';

const monitor = new ErrorMonitor({
  enabled: true,
  sentry: {
    dsn: process.env.SENTRY_DSN!,
    environment: process.env.NODE_ENV ?? 'development',
    release: 'ghita@0.0.3',
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
  },
  alertRules: [
    {
      id: 'rate-limit-spike',
      name: 'Rate limit spike',
      pattern: '429|rate.?limit',
      minSeverity: 'warning',
      threshold: 10,
      windowMs: 60_000,
      cooldownMs: 5 * 60_000,
      enabled: true,
      onTrigger: async (alert) => {
        await slack.send(`[GHITA] ${alert.ruleName} fired (${alert.count}x)`);
      },
    },
  ],
});

await monitor.init();

monitor.on('alert', (a) => console.warn('Alert:', a));
```

## Wrap async work

```typescript
const result = await monitor.withTransaction(
  'POST /chat',
  'http.server',
  { provider: 'openai' },
  async (tx) => {
    return monitor.withSpan('ai.chat', { model: 'gpt-4o' }, async (span) => {
      const response = await openai.chat(messages);
      return response;
    });
  },
);
```

## Top errors

```typescript
const top = monitor.topErrors(10);
for (const g of top) {
  console.log(`[${g.count}x] ${g.type}: ${g.message}`);
}
```
