# Release checklist v0.2.5

## A. Integrity

- [x] Version `0.2.5` đồng bộ root + packages + apps + manifest + docs + security constant
- [x] `scripts/sync-version.mjs --check` pass (chạy với `--set 0.2.5`)
- [x] Không còn tracked `nul` / `.sqlite` / `.log` rác
- [x] `packageManager` root = `pnpm@11.5.2` khớp CI

## B. Quality

- [x] `pnpm lint` pass
- [x] `pnpm typecheck` pass
- [x] Core package tests pass (security/agents/communication/ai-engine)
- [x] T0/T1 coverage floors đạt (security ~94%, agents ~69%, ai-engine ~66%, memory ~53%, communication ~53%, skills ~50%)
- [x] Smell budget ≤ target (`as_any` = 77 ≤ 130)

## C. Security

- [x] Security package ≥70% lines
- [x] Sanitizer/CORS/rotator tests pass
- [x] Computer-use/browser deny-path tests tạo (`tests/deny-default.test.ts`)
- [x] Communication pairing/session token/CORS tests tạo
- [x] `SECURITY.md` version table khớp `0.2.5`

## D. Docs

- [x] `README.md` badge `0.2.5`
- [x] `ROADMAP.md` cập nhật `v0.2.5`
- [x] `PROJECT.md` honest (Core vs Incubating)
- [x] `CHANGELOG.md` có section `[0.2.5]`
- [x] `docs/coverage-policy.md` có sẵn
- [ ] Tag `v0.2.5` (human: sau commit)
- [ ] GitHub release notes (Security / Tests / Fixes / Docs)

## E. Non-goals (explicit deferred)

- ❌ Marketplace production polish
- ❌ MCP server hoàn chỉnh
- ❌ iOS App Store submission
- ❌ Whisper STT rewrite
- ❌ Storybook / visual regression full suite
- ❌ Refactor toàn desktop UI
