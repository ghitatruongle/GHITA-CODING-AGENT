# Coverage Policy (v0.1.5)

> **Honesty first.** CI must never claim a global 80% floor while package
> thresholds and real coverage are lower.

## Why this exists

Before v0.1.5 the monorepo had three conflicting signals:

1. CI coverage gate claimed **≥80% lines for every package**
2. Package `vitest.config.ts` thresholds were typically **30–40%**
3. Measured coverage on critical packages was much lower
   (`agents` ~3%, `security` ~16%, `ai-engine` ~44%)

That mismatch destroyed trust in the quality gate.

## Tier model

See [`coverage-tiers.json`](./coverage-tiers.json).

| Tier   | Role                                    | Bootstrap floor (CI now) |  Ship target |
| ------ | --------------------------------------- | -----------------------: | -----------: |
| **T0** | security / agents / communication       |             70 / 55 / 50 | 70 / 55 / 50 |
| **T1** | ai-engine / memory / skills             |             45 / 50 / 45 | 55 / 50 / 45 |
| **T2** | computer-use / browser-control / shared |             35 / 40 / 30 |           40 |
| **T3** | satellite / incubating                  |                       30 |           30 |

Bootstrap floors are **honest** measured floors. Ship targets live in
`coverage-tiers.json#shipTargets` and are raised only after tests pass.

## Rules

1. Every package with a vitest config **must** emit `coverage/coverage-summary.json`.
2. CI fails if actual lines % is below the package threshold **or** the tier floor.
3. Thresholds may only be raised **after** tests land (never before).
4. Do not advertise a global 80% badge until **all T0 + T1 packages are ≥70%**.
5. Runtime-only paths that require live credentials should be documented and
   excluded only with explicit justification in the package vitest config.

## Local commands

```bash
# Package-level
pnpm --filter @ghita/security test -- --coverage
pnpm --filter @ghita/agents test -- --coverage

# Tier gate used by CI / dogfood
node scripts/check-coverage-tiers.mjs
```

## Raising floors

Process for increasing a floor:

1. Land tests that push measured coverage above the new floor
2. Bump `vitest.config.ts` thresholds
3. Bump `docs/coverage-tiers.json`
4. Confirm `node scripts/check-coverage-tiers.mjs` passes

## CI / dogfood enforcement (v0.1.5)

- CI `coverage-gate` runs package tests with coverage then:
  `node scripts/check-coverage-tiers.mjs --require-summaries`
- Dogfood generates coverage for **T0/T1** packages and enforces:
  `node scripts/check-coverage-tiers.mjs --tiers=T0,T1 --require-summaries`
- Floors are **gate-scope** (see package `vitest.config.ts` include/exclude).
  Do not market them as whole-monorepo 80% coverage.
