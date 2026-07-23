# @ghita/communication

![Version](https://img.shields.io/badge/version-0.1.5-blue)
![Coverage](https://img.shields.io/badge/coverage-53%_core_surface-yellow)
![Tier](https://img.shields.io/badge/tier-T0_critical-red)

Desktop ↔ mobile transport: pairing, Socket.IO server, guardrail pipeline, reconnect strategy, and channel plugins.

## Install

```bash
pnpm --filter @ghita/communication build
pnpm --filter @ghita/communication test
```

## Core surface (coverage-gated)

| Module                    | Notes                                            |
| ------------------------- | ------------------------------------------------ |
| `PairingManager`          | 6-char codes, TTL, lockout after failed attempts |
| `GuardrailPipeline`       | PII redact, keyword block, length limits         |
| `isSafeUrl` / `safeFetch` | SSRF denial for private ranges                   |
| `ReconnectStrategy`       | exponential backoff + jitter                     |
| `WsChannel`               | topic buffer/QoS/ack                             |
| `GatewayDaemon`           | lifecycle wrapper around communication server    |

Live token adapters under `src/channels/**` and `src/gateway/**` are **incubating** and excluded from the coverage gate.

## Usage

```ts
import { PairingManager, GuardrailPipeline } from '@ghita/communication';

const pairing = new PairingManager(300_000);
const code = pairing.getCode();
pairing.validate(code); // true

const gp = new GuardrailPipeline({ onHighSeverity: 'redact' });
const result = gp.process({
  gatewayType: 'telegram',
  text: 'email me@x.com',
} as never);
```

## Security notes

- Pairing lockout after 10 failures (5 min).
- Guardrail can `block` or `redact` high-severity threats.
- Coverage floor: **≥50% lines** on core surface.

## Test

```bash
pnpm --filter @ghita/communication exec vitest run --coverage
```
