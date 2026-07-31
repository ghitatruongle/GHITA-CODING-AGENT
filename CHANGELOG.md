# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.6.0] - 2026-07-30

### Theme: Durable, governed coding-agent runtime

#### Added

- **Durable ReAct execution**: stable run IDs, atomic checkpoints before and after tool calls, cancellation, explicit confirmation before replaying pending tools, and resume support after interruption.
- **Desktop run journal**: bounded, permission-restricted, redacted run history with list, inspect, prune, and checkpoint-resume flows.
- **Workspace memory journal**: per-workspace durable memory with credential screening, metadata redaction, explicit remember/forget tools, and bounded relevant-memory prompt injection.
- **Live code intelligence tools**: codebase indexing, symbol search, symbol context, and token-bounded PageRank repository maps, with cache invalidation after workspace mutations.
- **Runtime browser skills**: enabled browser/computer-use skills are exposed to the agent as governed tools; mutating actions remain subject to approval policy.
- **Mobile resume control**: mobile clients can inspect interrupted runs and explicitly confirm or reject replay of pending actions.
- **Native tool-call support for OpenAI-compatible, Anthropic, and Gemini providers**, including provider-neutral tool-call messages, provider-native result turns, and structured call extraction.

#### Security

- Replaced plaintext API-key persistence with the operating-system credential vault and one-time migration from legacy configuration.
- Isolated desktop session authentication from mobile pairing, hashed device tokens at rest, added one-time pairing credentials and pairing rate limits.
- Enforced deny-by-default policy decisions at the actual sidecar tool boundary.
- Removed broad Tauri shell permissions and routed approved commands through a native gate with destructive-command checks and a bounded 1-second to 5-minute timeout.
- Hardened workspace path resolution against symlink and junction escapes.
- Added SSRF protection for proxy destinations while retaining explicit loopback support for local preview.

#### Quality and accessibility

- Restored the native Rust suite to a compiling, passing state and added integration coverage for command, proxy, session-token, and timeout boundaries.
- Added focused regression suites for runtime authentication, run journals, memory journals, tool calling, policy governance, checkpoint resume, and workspace sandboxing.
- Added semantic alert dialogs and keyboard-operable chat history controls.
- Added blocking `rustfmt` and native test jobs to CI and release workflows; desktop packaging failures are no longer ignored.

---

## [0.4.9] - 2026-07-30

### Theme: Agent capability expansion + Windows/Android hardening

#### Added

- **Security scanner** (`@ghita/security`): local rule-based, fully-offline code scanner emitting findings/coverage documents with a 0–100 score.
- **Agent governance** (`@ghita/security`): deny-default `PolicyEngine` + OWASP Agentic AI Top 10 heuristic checks; wired into the ReAct agent as a pre-tool-call guard.
- **Agent Work Loop harness** (`@ghita/agents`): five-dimension / fifteen-check evaluator with evidence-bounded scoring + `scripts/blast-radius.mjs` and `scripts/mapping-gate.mjs`.
- **Instinct registry** (`@ghita/skills`): context-triggered skill auto-suggestion with priority + conflict resolution.
- **5 new dedicated AI providers**: xAI (Grok), OpenRouter, Together AI, Perplexity, Azure OpenAI — now **15 dedicated providers** total.
- **Browser act/extract/observe** (`@ghita/browser-control`): high-level AI page API with selector self-heal and zod-compatible schema extraction.
- **GUI grounding** (`@ghita/computer-use`): two-step locate→verify with retry policy; removed the mock-screenshot fallback from the production loop.
- **Repo-map ranking** (`@ghita/code-graph`): PageRank symbol ranking within a token budget.
- **Memory decay/reinforcement** (`@ghita/memory`): access-based strength with `reinforce(id)` + time decay.
- **Skill pack importer** (`@ghita/skills`): license-checked bulk SKILL.md import + curated "Community Essentials" pack.

#### Changed — Windows optimization

- Added an optimized Cargo `[profile.release]` (LTO, strip, `codegen-units=1`, `panic=abort`).
- Split Monaco and xterm into their own Vite vendor chunks for faster WebView cold start.
- Verify the SHA-256 of the bundled `node` runtime before spawn (audit M8); fall back to system `node` on mismatch.
- NSIS installer set to current-user with English/Vietnamese; added `scripts/bench-startup.mjs`.

#### Changed — Android

- Socket reconnect is now unbounded with exponential backoff + jitter (shared `computeBackoffDelay`).
- Bumped `targetSdk` to 35; declared `FOREGROUND_SERVICE(_CONNECTED_DEVICE)` and `CAMERA` permissions.
- Added shared adaptive-streaming quality selection and a QR pairing payload codec.

#### Notes

- Native Tauri plugin wiring (single-instance, tray, notification, deep-link) and Android device UI (QR camera screen, foreground-service module, biometric prompt, tablet layout) are staged behind a native build and tracked for a follow-up.

---

## [0.3.6] - Unreleased

### Theme: Production hardening

- Established `0.3.6` as the canonical version across workspace, native and packaging manifests.
- Extended integrity checks to cover Cargo, Tauri, Android, iOS, Snap and runtime constants.
- Replaced mock-only communication gateway lifecycles with real Discord, Slack and Telegram transports.
- Added bounded duplicate-event suppression and protocol tests for reconnect backoff and invalid signatures.
- Added body-size, origin, metrics-authentication and bounded rate-limit protections to the AI gateway.
- Blocked destructive commands at the Node skill adapter boundary and bounded process output.
- Replaced the mobile placeholder build with a real Metro production bundle.
- Made coverage, audit, license, documentation, Playwright and artifact-integrity checks blocking release gates.
- Release remains unpublished until every gate in `docs/release-plan-v0.3.6.md` is green.

---

## [0.2.5] - 2026-07-27

### Theme: Version Integrity + Core Hardening

- Unified version `0.2.5` across root package.json, all workspace packages, apps, manifest, docs, and security constants.
- Added regression test suites for agents core (`astLock`, `markdownGate`, `pipeline`, `subagent`, `scheduler`).
- Added security-path deny-default tests (`computer-use`, `browser-control`, `communication`).
- Quality slash: `as_any` reduced to 77 (target ≤130).
- Created release checklist (`docs/release-checklist-v0.2.5.md`).

### Security

- Security-path regression tests locked for deny-default surfaces.

### Testing

- Agents package: 15 test files, 114 tests passing.
- Security package coverage maintained ≥94%.

---

## [0.1.5] - 2026-07-23

### Theme: Trust Hardening

Integrity-first release. Prioritizes honest quality gates, core-package tests, and maintainability over new product features.

### Added

- Tiered coverage policy (`docs/coverage-policy.md`, `docs/coverage-tiers.json`) with honest floors
- Integrity scripts: `sync-version`, `check-artifacts`, `check-coverage-tiers`, `count-smells`
- CI `integrity` job (version/artifacts/smell budget) + honest coverage gate
- Core unit suites for security, agents, communication, ai-engine, memory, skills
- Security-path tests for computer-use / browser-control deny defaults
- Runnable dry-run examples: agent-workflow, browser-automation, computer-use
- Desktop maintainability split (helpers/presentational components; original UI preserved)

### Fixed

- Version drift across package.json / docs / security constants → unified `0.1.5`
- Removed tracked junk artifacts (`nul`, logs, sqlite ledgers)
- pnpm toolchain mismatch (root + CI locked to `11.5.2`)
- Desktop god-file split regressions (WebView nav, Devices server panel, Ecosystem router, agent timeline restored from original JSX)

### Changed

- Dogfood is integrity-first and enforces T0/T1 coverage summaries + floors
- Coverage no longer claims a fake global 80% floor
- Package READMEs for T0/T1 rewritten with real API/security/test docs
- README documents Core vs Incubating packages

### Security

- Expanded sanitizer / CORS / rotator / audit-runner unit coverage (~94% lines)
- Deny-by-default regression tests for destructive computer-use commands
- Pairing lockout / guardrail / SSRF helper tests for communication core

### Coverage floors (gate scope)

| Package       | Floor | Notes                                             |
| ------------- | ----: | ------------------------------------------------- |
| security      |   70% | full package                                      |
| agents        |   55% | impl surface (excludes adapters/git/types barrel) |
| communication |   50% | core surface (excludes live token adapters)       |
| ai-engine     |   45% | unit-testable core surface                        |
| memory        |   50% | impl surface                                      |
| skills        |   45% | impl surface                                      |

## [0.0.5] - 2026-07-XX

### 🎯 Theme: Stable Foundation — 44 audit fixes + 5 Q3 features

First official release. Closes all 44 findings from the codebase audit (run on 2026-06-13) and ships 5 Q3 2026 features with full UI integration.

### ✨ Added

#### 🧪 Q3 2026 features (full UI)

- **Notification System** — Bell icon in header with badge counter, dropdown panel, mark-read on open, dismiss button, OS-level notifications via Tauri `show_notification` command. Hook: `useNotifications`. Component: `NotificationTray`.
- **Monitoring Dashboard** — Real-time stats grid (total errors, error groups, active alert rules, telemetry events), top errors list from `ErrorGrouper`, telemetry log. View: `MonitoringView`. Auto-refresh every 15s.
- **Quota & Rate Limiting** — Monthly budget gauge (color-coded by usage %), rate limit cards, usage summary table, recent usage log. Persistence to `appDataDir/budget.json`. View: `QuotaView`.
- **Code Knowledge Graph** — Workspace path input, builds AST graph via `CodeKnowledgeGraph`, kind statistics, filter by name/file, results table. View: `CodeGraphView`.
- **Voice I/O (STT)** — Mic button in chat input, Web Speech API integration with graceful fallback, live interim transcript, listening indicator. Hook: `useVoiceInput`. Component: `VoiceInputButton`.

#### 🔒 Security (10 P1 fixes)

- **2.14** SSRF + DNS Rebinding — both `input-sanitizer.ts` and `communication/security.ts` now resolve DNS once, validate IP, fetch by IP with `Host` header
- **2.7** PII stream — 32-token sliding window buffer before PII regex
- **2.11** Secret rotator — rotated key now returned and stored; `getActiveKey()` exposes it
- **2.18** Daemon restart — real stop → start cycle (not just state update)
- **2.8** Stream content filter + secret detector — wired into `chatStream` middleware
- **2.10** HTTP timeout — `AbortController` cancels in-flight requests
- **2.3** Workflow setTimeout — `clearTimeout` in `finally`
- **2.4** Workflow circular false positive — `try/finally` cleans `inProgress`
- **2.5** Subagent initial sync — diff against empty parent state at version 0
- **2.6** Subagent queue — FIFO when at `maxConcurrency`

#### 🖥️ A11y + Tauri hardening (16 P2 fixes)

- **1.1, 1.2** Keyboard nav on FileExplorer, ApiManager (`role="treeitem"`, `tabIndex`, `onKeyDown` for Enter/Space)
- **1.3** `.focus-ring` global class with `!important` outline; removed `outline: 'none'` from 4 files
- **1.4** `id`/`htmlFor` pairing on ApiManager form inputs
- **1.5** Mobile touch coords: letterbox/pillarbox math in `ScreenPreview`
- **1.6** `accessibilityRole="button"` on `TouchableOpacity` in `RemoteControlScreen`
- **1.7** LocaleCode unified to `vi, en, zh, ru, ja, ko` across packages
- **1.8** Hardcoded chat strings → `t('chat.copy')` etc, all 6 locales translated
- **2.1** DebateEngine JSON: string-aware brace matching
- **2.2** Workflow deps: validation + cycle detection (Kahn's algorithm)
- **2.9** Budget persistence: `budget.json` v1 with daily/monthly reset scheduler
- **2.12** Keychain: throw on decrypt failure (no destructive clear)
- **2.13** Hardcoded keychain password: `process.env.GHITA_KEYCHAIN_PASSWORD`
- **2.15** `import crypto from 'node:crypto'` in session.ts
- **2.16** Tier 3 `get(id)`: direct SQLite ID lookup (no vector search)
- **2.17** Skill guard hash: include `index.js` content
- **2.19** Tier manager math: `+` not `-`
- **3.1** Tokio panic: `tauri::async_runtime::block_on`
- **3.2** Sidecar production path: `resource_dir()` + dev fallback
- **3.3** IPC hijacking RCE: `GHITA_SESSION_TOKEN` env, constant-time compare
- **3.4** Capabilities: `bash` + `sh` in `shell:allow-execute`
- **3.5** PTY shell: `#[cfg(target_os = "...")]` for `bash`/`zsh`/`powershell.exe`
- **3.6** UTF-8 buffer: carry incomplete bytes across reads
- **3.7** CSP: `frame-src 'self' http://localhost:* http://127.0.0.1:*`
- **3.8** Terminal session leak: `sessions.remove()` on EOF
- **3.9** Port liberation: scan free port starting from configured (no `taskkill`)

#### 📱 Android (8 P2 fixes)

- **4.1** `MainActivity.onCreate(null)` to prevent Fragment restore crash
- **4.2** Proguard `-keep class kjd.reactnative.bluetooth.** { *; }`
- **4.3** `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`
- **4.4** Remove duplicate `includeBuild` in `settings.gradle`
- **4.5** `Platform.Version >= 31` skips `ACCESS_FINE_LOCATION`; `android:maxSdkVersion="30"`
- **4.6** Release task detection: any of `release|bundle|assemble|install`
- **4.7** `<uses-feature android:name="android.hardware.bluetooth" android:required="false" />`
- **4.8** `cleartextTrafficPermitted="false"` in `network_security_config.xml`, debug config separate

#### 🍎 iOS Build

- iOS ad-hoc build verified on Xcode 15+ / iOS 16+ Simulator (`CODE_SIGNING_ALLOWED=NO`)
- Build artifact: `apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/GhitaMobile.app`
- App Store submission deferred to 0.0.6 (requires paid Apple Developer account + TestFlight setup)

### 🔧 Changed

- iOS beta build pipeline retained (ad-hoc only, `CODE_SIGNING_ALLOWED=NO`)
- Knip + `pnpm audit` checks in CI
- All packages have `sideEffects: false` (preserved from beta)
- New `reactflow` dep added to desktop for code graph visualization

### 📊 Key Metrics

| Metric                  | v0.0.4 | v0.0.5-beta | v0.0.5                  |
| ----------------------- | ------ | ----------- | ----------------------- |
| Audit findings closed   | 0/44   | 0/44        | **44/44**               |
| Features with full UI   | 0      | 0           | **5**                   |
| Packages with tests     | 15/22  | 22/22       | 22/22                   |
| Coverage threshold avg  | ~28%   | ~35%        | ~35%+ (root ≥50%)       |
| macOS auto-updater      | ❌     | ✅          | ✅                      |
| iOS release build       | ❌     | ✅ ad-hoc   | ✅ ad-hoc               |
| IPC token enforcement   | ❌     | ❌          | **✅**                  |
| PII stream coverage     | ❌     | ❌          | **✅**                  |
| Sidecar production path | ❌     | ❌          | **✅**                  |
| Total dependencies      | 239    | ~222        | ~225 (react-flow added) |

---

## [0.0.5-beta] - 2026-06-25

### 🎯 Theme: Quality & Platform — 5 trụ cột cho beta

Giải quyết 5 điểm yếu được chẩn đoán: over-engineering risk, coverage thấp, thiếu macOS/iOS, packages chưa có test, và dependency bloat.

### ✨ Added

#### 🧪 Testing (144 tests mới)

- **browser-control**: 103 tests across 4 files — `BrowserController`, `TabManager`, `MemoryTabStorage`, `SearchEngine`, `createStealthContext`, `applyStealth`, `withStealth`, `aiClick`, `aiExtract`, `collectCandidates`, `resolveSelectorByIntent`
- **code-graph**: 28 tests — `KnowledgeGraph` (add/remove/traverse/path/cycle/JSON), `SearchEngine` (exact/prefix/substring/scope/filePrefix/minScore)
- **gui**: 37 tests — `LayoutPresetManager` (save/restore/rename/delete/persist), `ShortcutRegistry` (register/trigger/validate), `ThemeManager` (kind/accent/fontSize/cssVars), `ClipboardService`
- **monitoring**: 18 tests — `ErrorGrouper` (ingest/group/top/stats), `AlertEngine` (evaluate/threshold/cooldown/enable-disable)
- **notification**: 16 tests — `NotificationHistory` (add/markRead/unread/filter/clear), `NotificationTemplate` (variable/nested/default/escape/plural/raw)
- **quotas**: 18 tests — `RateLimiter` (check/limit/reset/peek/stats), `UsageTracker` (record/cost/pricing/query/summary)
- **voice**: 27 tests — `AudioRingBuffer` (push/read/wrap/RMS/clear), `VoiceActivityDetector` (speech-start/speech-end/silence), `TextToSpeech` + `SilentTtsProvider`

#### 🍎 Platform: macOS + iOS

- **macOS auto-updater**: `darwin-x86_64` + `darwin-aarch64` entries in `latest.json` release manifest
- **macOS sidecar path**: Fixed `node.exe` → cross-platform `node` via `std::env::consts::EXE_SUFFIX`
- **macOS shell default**: Terminal now defaults to `zsh` on macOS (default since Catalina), `bash` on Linux, `powershell.exe` on Windows
- **iOS build pipeline**: New `build-ios` job in `release.yml` — builds `.app` with `CODE_SIGNING_ALLOWED=NO` for ad-hoc distribution
- **iOS code signing script**: `scripts/ios-sign.mjs` — Debug/Release modes, automatic CocoaPods install
- **iOS CLI platform**: Added `@react-native-community/cli-platform-ios` to mobile devDependencies

#### 📦 Dependency & Build Optimization

- **Knip**: Installed `knip` for unused dependency detection, added `pnpm knip` script, `knip.json` config
- **17 unused dependencies removed**: `playwright-stealth`, `node-pty`, `debug`, `socket.io-client`, `socket.io-parser`, `lint-staged`, `clsx`, `tailwind-merge`, `sharp`, `@testing-library/user-event`, `@babel/runtime`, `@react-native/codegen`, `@react-native/community-cli-plugin`, `@react-native/gradle-plugin`, `@react-native/typescript-config`, `@testing-library/jest-native`, `@testing-library/react-native`, `react-test-renderer`
- **sideEffects: false**: Added to all 22 workspace packages for deeper tree-shaking
- **Turborepo inputs**: Added `inputs` globs to all tasks in `turbo.json` for precise cache invalidation
- **Renovate**: Major updates now require manual review (auto-merge disabled), security labels enabled

#### 🔒 CI/CD Improvements

- **Coverage gate**: Now fails hard if any package is missing `coverage-summary.json` (no more silent skips)
- **Coverage thresholds raised**: agents 0→30, ai-engine 30→40, memory 10→30, security 15→30, communication 30→35, computer-use 30→35, marketplace 30→35, skills 30→35, shared 25→30
- **New coverage thresholds**: a11y, i18n, integration, mobile-companion, relay-server, migration (20/10/20/20)
- **Mutation testing**: Expanded Stryker scope to include `browser-control`
- **Security audit**: Added `pnpm audit` + `knip` checks to CI `security-audit` job

#### 📊 Market Validation

- **Opt-in telemetry**: `UsageTelemetry` class in `packages/monitoring` — local-only, no cloud calls, tracks feature usage patterns
- **Dogfooding script**: `scripts/dogfood.mjs` — automated smoke-test of all core flows (build→lint→test→coverage→audit→knip)
- **PR checklist**: Updated `CONTRIBUTING.md` — tests pass required, new features need tests (EN + VI)

### 🔧 Changed

- `ROADMAP.md`: iOS beta marked as done in v0.0.5
- `CONTRIBUTING.md`: Enhanced PR checklist with test requirements
- `renovate.json`: Major updates restricted, security labels added

### 📊 Key Metrics

| Metric                            | v0.0.4      | v0.0.5-beta  |
| --------------------------------- | ----------- | ------------ |
| Packages có coverage output       | 12/22 (55%) | 22/22 (100%) |
| Packages có test script           | 15/22 (68%) | 22/22 (100%) |
| Packages zero test                | 7           | 0            |
| Threshold trung bình (statements) | ~28%        | ~35%         |
| Total dependencies                | 239         | ~222 (-7%)   |
| macOS auto-updater                | ❌          | ✅           |
| iOS release build                 | ❌          | ✅           |
| sideEffects tree-shaking          | 0/22        | 22/22        |
| CI coverage gate                  | Silent skip | Fail hard    |

---

## [0.0.3-beta2] - 2026-06-02

### 🏗️ Architecture

- **Monorepo**: pnpm workspaces + Turborepo with 6 packages (`ai-engine`, `agents`, `skills`, `memory`, `shared`, `communication`) and 3 apps (`desktop`, `mobile`, `vscode-extension`).
- **21-Phase Sprint Plan** completed across 5 sprints spanning Foundation → Orchestration → Discovery → Protocols → Release.

### ✨ Added

#### Sprint 1 — Foundation

- **P1: Cost Tracking & Budget** — Per-request cost logging, budget alerts, cost limit middleware (`ai-engine/src/cost/`).
- **P2: Adaptive Router** — Complexity-based model selection with provider recommendation and dynamic fallback (`ai-engine/src/router/`).
- **P3: Stealth Browser Automation** — AI browser automation (Browser Use), stealth browsing (CloakBrowser), multi-tab session management (`browser-control/src/`).
- **P4: Tool Registry & Composio** — 200+ tool integration registry, custom tool builder, Composio SaaS adapter (`ai-engine/src/tools/`).

#### Sprint 2 — Orchestration & Infrastructure

- **P5: Multi-Agent Orchestration** — ReAct runtime loop, DAG flow orchestrator, task delegation pipeline (`agents/src/react/ + flow/`).
- **P6: Sub-Agent Spawner** — Sub-agent spawning with isolated context, inter-agent communication, parent-child state sync (`agents/src/subagent/`).
- **P7: Plugin & Sandbox Hardening** — Plugin manifest + lifecycle, Docker sandbox security model, threat logging (`skills/src/plugin-system.ts`).
- **P8: Gateway Daemon & Guardrail** — Background daemon, DM pairing security, content filter & PII redaction (`communication/src/`).

#### Sprint 3 — Discovery & Evaluation

- **P9: Skill Marketplace & Auto-Create** — ClawHub-style marketplace, skill auto-create from trajectories, dynamic skill generator (`skills/src/marketplace/`).
- **P10: Model Auto-Discovery** — Auto-discovery with cache + TTL, secure key loader with redaction, provider health checks (`ai-engine/src/discovery/`).
- **P11: LLM-as-Judge Evaluator** — Rubric-based LLM evaluator, reasoning trace extraction (thinking blocks), Ralph self-correcting loop (`ai-engine/src/enterprise/`).
- **P12: Hooks Runner & Git Safety** — Pre/post hook runner, security checkers, middleware pipeline, git safety net & auto-commit (`ai-engine/src/hooks/`).

#### Sprint 4 — Protocols & Memory

- **P13: MCP Transport & Protocols** — Stdio/HTTP MCP transport, tool auto-repair gate with LLM healing, MCP server factory for filesystem/sqlite/github (`ai-engine/src/mcp/`).
- **P14: Rust Semantic Memory** — Rust FTS5 + cosine similarity addon, memory compaction & indexing, cross-session search (`memory/src/semantic/`).
- **P15: Knowledge Graph RAG** — Entity & relation extractor, knowledge graph query compiler with subgraph traversal, context-enriched prompt builder (`memory/src/knowledge/graph.ts`).
- **P16: Debate Panel & Group Protocol** — Multi-agent debate engine (Innovator/Devil's Advocate/Editor-in-Chief), group protocol, workflow step engine (`agents/src/orchestrator/`).

#### Sprint 5 — IDE, Mobile & Release

- **P17: IDE UI & Workspace** — Monaco editor integration (lazy-loaded), file explorer with dirty detection, workspace tab system (`apps/desktop/src/views/`).
- **P18: VS Code Extension Sync** — VS Code Extension WebSocket sync via Socket.io, Monaco diagnostics & Diff View, terminal integration with xterm.js + PTY (`apps/vscode-extension/`).
- **P19: Multimodal UI & Evals** — OCR + video multimodal pipeline, vision action parser (UI-TARS), visual workflow builder & evals engine (`ai-engine/src/platform/`).
- **P20: BLE Touch Remote & Release** — BLE discovery service & permissions (Android 12+), Socket.io touch event transport, screen touch coordinates mapping (`apps/mobile/src/`).
- **P21: Wrap-up & Release** — Full test verification (497/497 pass), verification report, performance audit, release notes.

### 🧪 Testing

- **37 test files** covering all 21 phases.
- **497 unit tests** — all passing.
- **100% pass rate** with zero flaky tests.
- Comprehensive mocking for React Native, Socket.io, and MCP transports.

### 📊 Key Metrics

| Metric        | Value    |
| ------------- | -------- |
| Total Phases  | 21/21 ✅ |
| Total Tasks   | 63/63 ✅ |
| Test Files    | 37       |
| Test Cases    | 497      |
| Pass Rate     | 100%     |
| Test Duration | ~15s     |

### 🔧 Dependencies

- Node.js ≥ 20.0.0
- pnpm 10.14.0
- Turborepo 2.3.0
- TypeScript 5.6.0+
- React Native 0.76.9
- Vitest 3.2.4

---

## [0.0.2] - 2025-12-01

### Added

- Initial monorepo structure with desktop and mobile apps.
- Basic AI engine with LiteLLM integration.
- Socket.io communication layer.
- Bluetooth discovery service.
- Basic skill registry.

---

## [0.0.1] - 2025-09-01

### Added

- Project inception.
- Core architecture design.
- Initial prototype.
