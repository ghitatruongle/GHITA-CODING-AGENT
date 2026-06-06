---
id: security
title: Security
sidebar_label: Security
sidebar_position: 3
---

# Security

`@ghita/security` (Phase 34) cung cấp audit toolkit.

## Input sanitization

```typescript
import { InputSanitizer } from '@ghita/security';

const sanitizer = new InputSanitizer();

const { issues, cleaned } = sanitizer.scan(userInput, 'chat.userMessage');
if (issues.length > 0) {
  await monitor.captureMessage('Suspicious input', 'warning', { tags: { issues: String(issues.length) } });
}

// Safe to render:
const safe = sanitizer.escapeHtml(cleaned);
```

## CORS audit

```typescript
import { CorsAuditor } from '@ghita/security';

const auditor = new CorsAuditor();
const issues = auditor.audit(
  {
    origins: ['*'],
    methods: ['GET', 'POST', 'TRACE'],
    headers: ['*'],
    credentials: true,
  },
  'api.config.ts',
);
```

## Key rotation

```typescript
import { SecretRotator } from '@ghita/security';

const rotator = new SecretRotator({
  defaultRotationIntervalMs: 90 * 86400_000,
  generateKey: async (provider) => callProviderToMint(provider),
  revokeKey: async (provider, keyId) => callProviderToRevoke(provider, keyId),
});

rotator.register({
  id: 'openai-prod-1',
  provider: 'openai',
  maskedKey: 'sk-...abc',
  createdAt: Date.now() - 100 * 86400_000, // already due
});

// Rotate tất cả key đến hạn
const events = await rotator.tick();
```

## Audit runner

```typescript
import { AuditRunner } from '@ghita/security';

const runner = new AuditRunner();
const report = await runner.run({
  threshold: 80,
  inputsToScan: [{ value: userInput, location: 'chat' }],
  corsConfigs: [{ config: corsConfig, location: 'api.config.ts' }],
  rotateKeys: true,
});

if (!report.passed) {
  await slack.send(`[Security] Score ${report.score} < ${report.threshold}`);
}
```
