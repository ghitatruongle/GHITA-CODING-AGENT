# Release plan v0.3.6

`v0.3.6` is a production-hardening release. A version bump alone does not make
the release complete: the tag may be created only after every blocking gate
below succeeds from a clean clone.

## P0 — Release integrity

- [x] Use root `package.json` as the canonical version source.
- [x] Synchronize package, Tauri, Cargo, Android, iOS, Snap and runtime versions.
- [x] Make `node scripts/sync-version.mjs --check` detect native drift.
- [x] Fix the desktop skill socket payload contract.
- [x] Make `cargo check --locked` reproducible.
- [x] Replace the mobile placeholder build with a real production bundle.
- [x] Produce an installable Android release artifact.
- [ ] Produce and smoke-test signed desktop artifacts on every supported OS.
- [ ] Produce and smoke-test the unsigned iOS CI artifact.

## P1 — Blocking quality and security

- [x] Full `pnpm test` passes with no unexplained skips.
- [x] Every T0/T1 package regenerates coverage in the current CI run.
- [ ] No critical or high production dependency advisory remains.
- [x] Block destructive commands at the Node skill runtime boundary.
- [x] Bound terminal output retained in memory.
- [x] Require metrics authentication and enforce request-body/CORS limits.
- [x] Make audit, documentation, E2E and release checks blocking.
- [x] Enforce production license policy across the full workspace.
- [ ] Generate non-empty updater signatures from the built artifacts.

## P2 — Product completeness

- [x] Telegram token validation, long polling and graceful shutdown.
- [x] Discord Gateway WebSocket lifecycle, heartbeat, reconnect and inbound messages.
- [x] Slack Events API signature verification and Socket Mode lifecycle.
- [x] Run blocking Playwright smoke tests against the real desktop web build.
- [x] Add protocol-level tests for reconnect, invalid signatures and duplicate events.
- [ ] Run golden E2E flows for chat, tool approval, file editing, terminal and recovery.

## P3 — Maintainability and documentation

- [x] Replace the fake React Hooks lint rule with the official plugin.
- [ ] `pnpm format:check` passes.
- [x] `pnpm knip` has no unresolved or unlisted dependencies.
- [x] `pnpm build:docs` and the Docusaurus build pass.
- [x] Remove stale version claims and mojibake from public documentation.
- [ ] Complete two consecutive clean CI runs before tagging.

## Required release evidence

The release checklist must record:

1. Commit SHA and exact Node, pnpm and Rust versions.
2. Test and coverage summaries generated from that SHA.
3. Dependency audit report.
4. SHA-256 checksum, signature and SBOM for every artifact.
5. Install/start/update/rollback smoke-test results.
6. Known limitations and explicitly deferred work.

No item may be marked complete based solely on an existing cached artifact.
