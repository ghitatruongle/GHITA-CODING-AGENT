# Release Plan — v0.4.9

> **Theme:** Agent capability expansion + Windows/Android hardening
> **Status:** Unreleased — every gate below must be green before publishing.

## Scope

Adds original agent-capability modules across 7 core packages, raises the AI
provider count to a real 15, and hardens the Windows desktop build and Android
app. See `CHANGELOG.md` `[0.4.9]` for the full itemized list.

## Release gates

| Gate                     | Command                                             | Status |
| ------------------------ | --------------------------------------------------- | ------ |
| Version integrity        | `node scripts/sync-version.mjs --check`             | ✅     |
| Smell budget (as-any)    | `node scripts/count-smells.mjs --max-as-any=130`    | ✅     |
| Typecheck                | `pnpm typecheck`                                    | ✅     |
| Lint (new modules)       | `npx eslint <new files>`                            | ✅     |
| Unit tests (touched pkgs)| `pnpm test` (security/agents/skills/ai-engine/…)    | ✅     |
| Coverage tiers (T0/T1)   | `node scripts/check-coverage-tiers.mjs --tiers=T0,T1`| ⬜     |
| Playwright e2e smoke     | CI `e2e-smoke` job                                  | ⬜     |
| Desktop build (Tauri)    | `pnpm build:desktop` (needs Rust + `sha2` fetch)     | ⬜     |
| Android build (APK)      | `pnpm build:android` (needs device/SDK)             | ⬜     |

## Follow-ups requiring a native build (not in this change set)

- Tauri plugins: single-instance, tray icon, notification, deep-link (`ghita://`).
- Android device UI: QR camera screen, foreground-service module, biometric
  app-lock prompt, tablet/landscape two-column remote layout.
- Wire the shared adaptive-streaming quality into the sidecar screenshot loop
  and the mobile RTT feedback channel.

## New unit test coverage added in 0.4.9

- `@ghita/security`: scanner (13), governance (15)
- `@ghita/agents`: policy-guard (3), harness (9)
- `@ghita/skills`: instinct-registry (8), skill-pack-importer (5)
- `@ghita/ai-engine`: new-providers (6)
- `@ghita/browser-control`: ai-page (9)
- `@ghita/computer-use`: grounding (10)
- `@ghita/code-graph`: repo-map (10)
- `@ghita/memory`: reinforcement (11)
- `@ghita/shared`: connection (9)
- `@ghita/desktop`: message windowing (6)
