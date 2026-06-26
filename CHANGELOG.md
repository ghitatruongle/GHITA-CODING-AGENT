# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
