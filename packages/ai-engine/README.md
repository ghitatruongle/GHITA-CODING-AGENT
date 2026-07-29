# @ghita/ai-engine

![Version](https://img.shields.io/badge/version-0.3.6-blue)
![Coverage](https://img.shields.io/badge/coverage-66%25_core_surface-yellow)
![Tier](https://img.shields.io/badge/tier-T1_core-orange)

Multi-provider AI gateway: key rotation, fallback/circuit breaker, routing, anti-slop filtering, streaming, and cost tracking.

## Install

```bash
pnpm --filter @ghita/ai-engine build
pnpm --filter @ghita/ai-engine test
```

## Unit-testable core (coverage-gated)

| Path                                           | Role                                        |
| ---------------------------------------------- | ------------------------------------------- |
| `src/key-manager.ts`                           | multi-key failover / cooldown / 429 backoff |
| `src/router/**`                                | unified router + dynamic fallback           |
| `src/middleware/**`                            | anti-slop and chat middleware               |
| `src/gateway/**`                               | fallback manager / budgets                  |
| `src/cache/**`, `src/cost/**`, `src/stream/**` | supporting utilities                        |

Credential-bound providers (`src/providers/**`) and enterprise SSO surfaces are not required for the v0.1.5 gate.

## Usage

```ts
import { KeyManager } from '@ghita/ai-engine';
import { DynamicFallbackRouter } from '@ghita/ai-engine';
import { cleanSlop } from '@ghita/ai-engine';

const keys = new KeyManager(['sk-aaaa1111bbbb2222', 'sk-cccc3333dddd4444'], 'failover');
const active = keys.getNextKey();
keys.reportFailure(active!, 429);

const router = new DynamicFallbackRouter({
  chain: [
    { id: 'primary', provider: 'openai', model: 'gpt-4o-mini' },
    { id: 'backup', provider: 'anthropic', model: 'claude' },
  ],
  retry: { maxRetries: 0, jitter: false },
});
const out = await router.execute(async (t) => `ok:${t.id}`);

const cleaned = cleanSlop('Certainly! Here is the fix.');
```

## Security notes

- 401 deactivates key; 429 applies exponential cooldown.
- Circuit breaker opens after consecutive failures; emergency target optional.
- Coverage floor (core surface): **≥45%** (measured ~66%).

## Test

```bash
pnpm --filter @ghita/ai-engine exec vitest run --coverage
```
