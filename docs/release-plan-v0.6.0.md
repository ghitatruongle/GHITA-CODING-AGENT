# Release Plan — v0.6.0

> **Theme:** Durable, governed coding-agent runtime  
> **Status:** Unreleased — do not tag or publish until every blocking gate is green.

## Release objective

Ship a coherent agent runtime rather than a collection of disconnected
capabilities. A v0.6.0 agent run must be authenticated, policy-governed,
workspace-contained, resumable after interruption, and observable from desktop
and mobile clients.

## Included scope

- Provider-neutral native tool calls for OpenAI-compatible providers.
- Deny-default tool governance at the sidecar execution boundary.
- Durable ReAct checkpoints, cancellation, run history, and confirmed resume.
- Per-workspace durable memory with redaction and credential screening.
- Code indexing, symbol/context search, and PageRank repository maps.
- Governed browser/computer-use skills selected from the existing skill registry.
- OS credential-vault storage and migration for provider API keys.
- Separate desktop-session and mobile-pairing authentication.
- Hashed device tokens, one-time pairing credentials, and rate limits.
- Symlink-safe workspace containment and bounded native commands.
- Desktop and mobile UI for run history and resume confirmation.

## Blocking release gates

| Gate                     | Command / workflow                            | Local state              |
| ------------------------ | --------------------------------------------- | ------------------------ |
| Version integrity        | `node scripts/sync-version.mjs --check`       | Passed: 0.6.0 everywhere |
| Artifact integrity       | `node scripts/check-artifacts.mjs`            | Passed locally           |
| Native formatting        | `cargo fmt -- --check`                        | Passed locally           |
| TypeScript typecheck     | `pnpm typecheck`                              | Passed: 35 tasks         |
| Lint                     | `pnpm lint`                                   | Passed: 34 tasks         |
| JavaScript tests         | `pnpm test`                                   | Passed: 35 tasks         |
| Native Rust tests        | `cargo test --locked`                         | Passed: 50 tests         |
| T0/T1 coverage floors    | `check-coverage-tiers --require-summaries`    | Passed: 6 packages       |
| Security policy          | `pnpm audit:policy`                           | Passed locally           |
| License policy           | `pnpm licenses:check`                         | Passed locally           |
| Unused dependencies      | `pnpm knip --no-progress`                     | Passed locally           |
| Package build            | `pnpm build:packages`                         | Passed: 22 packages      |
| Desktop web build        | `pnpm --filter @ghita/desktop build`          | Passed locally           |
| Mobile JS bundle         | `pnpm --filter @ghita/mobile build`           | Passed locally           |
| VS Code extension        | `pnpm --filter @ghita/vscode-extension build` | Passed locally           |
| API and website docs     | TypeDoc + Docusaurus (`vi`, `en`)             | Passed locally           |
| Browser smoke            | CI `e2e-smoke` / release gate                 | Pending CI               |
| Cross-platform artifacts | release workflow                              | Pending CI               |

## Local verification notes

- The monorepo test command passed all 35 Turbo tasks. Thirteen Docker
  integration cases in `@ghita/computer-use` were environment-gated and skipped;
  they are not counted as executed tests.
- The audit policy reports zero critical findings. One inherited high finding
  (`GHSA-mh99-v99m-4gvg`) is explicitly allowlisted until 2026-09-01 for
  repository-controlled build inputs.
- Repository-wide `pnpm format:check` is not a current release-workflow gate and
  still reports pre-existing formatting debt across 488 files. Files changed for
  v0.6.0 were formatted directly; native Rust formatting is blocking.
- Signed desktop installers, native Android/iOS artifacts, and Playwright smoke
  remain CI-only evidence and must pass before publication.

## Manual acceptance checks

1. Pair a new mobile device and verify the raw pairing token is displayed only once.
2. Restart the desktop app and verify the paired device reconnects with its stored credential.
3. Start an agent task, interrupt it with a pending tool, restart, and resume only after confirmation.
4. Verify rejected resume leaves the checkpoint intact and does not replay the tool.
5. Index a representative repository and use symbol search, symbol context, and repository map.
6. Enable one read-only browser skill and verify it appears to the agent; verify a mutating browser action requests approval.
7. Save a non-sensitive workspace memory and retrieve it in a later run; verify credential-like content is rejected.
8. Attempt a workspace escape through a symlink/junction and verify access is denied.
9. Run an approved long-running native command and verify timeout termination.
10. Confirm API configuration files contain no plaintext provider secret after migration.

## Explicit non-goals

- Publishing, tagging, committing, or pushing from the upgrade task.
- Claiming production readiness before CI builds signed artifacts.
- Automatically saving arbitrary conversation content into durable memory.
- Automatically replaying a pending tool after interruption.
- Enabling dangerous browser/computer-use skills by default.

## Rollback

If a blocking gate fails after version synchronization, keep `v0.6.0`
unpublished, fix forward on the same development branch, and rerun the full gate
set. Do not tag a partial or locally-only build.
