---
id: packages-monitoring
title: @ghita/monitoring
sidebar_label: monitoring
---

# @ghita/monitoring

Error monitoring (Sentry), performance tracing, alert rules.

Xem [tutorial](/docs/monitoring) để biết cách dùng.

## Exports

```typescript
import {
  ErrorMonitor, // facade
  SentryClient, // Sentry transport
  ErrorGrouper, // dedup
  Tracer, // perf tracing
  AlertEngine, // rule engine
} from '@ghita/monitoring';
```
