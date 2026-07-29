# 🗺️ GHITA CODING AGENT — Public Roadmap

> **Current version:** v0.3.6-dev
> **Last updated:** 2026-07-28

---

## In progress — v0.3.6 Production Hardening

This release is intentionally focused on trust rather than feature count:

- One canonical version across JavaScript, Rust, Android, iOS and packaging manifests.
- Blocking CI for integrity, tests, documentation, security and release artifacts.
- Reproducible desktop and mobile builds from frozen lockfiles.
- Authenticated and bounded AI gateway endpoints.
- Real Discord, Slack and Telegram gateway lifecycles.
- Dependency and command-execution hardening.

The release remains `-dev` until every gate in
[`docs/release-plan-v0.3.6.md`](docs/release-plan-v0.3.6.md) passes on a clean clone.

---

## ✅ Done — v0.1.5 Trust Hardening (2026-07-22)

| Khu vực           | Tính năng                                 | Trạng thái |
| ----------------- | ----------------------------------------- | ---------- |
| 🔐 Integrity      | Unified version 0.1.5 across monorepo     | ✅         |
| 🧪 Coverage       | Honest tiered coverage gate               | ✅         |
| 🛡️ Security tests | Security unit blitz + deny-path tests     | ✅         |
| 🤖 Agents tests   | ReAct + AdvancedWorkflow regressions      | ✅         |
| 🧰 Toolchain      | pnpm 11.5.2 locked in packageManager + CI | ✅         |
| 📘 Docs           | Coverage policy + Core vs Incubating      | ✅         |
| 📦 Examples       | Runnable dry-run examples                 | ✅         |

> Non-goals deferred: marketplace production, MCP package, iOS App Store, Whisper STT.

---

## ✅ Done — v0.0.5 Official (2026-07-XX)

| Khu vực            | Tính năng                                                   | Trạng thái |
| ------------------ | ----------------------------------------------------------- | ---------- |
| 🧠 AI Engine       | Multi-provider (OpenAI, Anthropic, Google, Ollama, LiteLLM) | ✅         |
| 🧠 AI Engine       | Adaptive Router — complexity-based model selection          | ✅         |
| 🧠 AI Engine       | Cost Tracking & Budget Alerts                               | ✅         |
| 🧠 AI Engine       | Tool Registry + Composio (200+ tools)                       | ✅         |
| 🤖 Agents          | ReAct Runtime + DAG Flow Orchestrator                       | ✅         |
| 🤖 Agents          | Sub-Agent Spawner (isolated context)                        | ✅         |
| 🤖 Agents          | Agent Groups — specialized teams                            | ✅         |
| 🎯 Skills          | Skill create/edit/run system                                | ✅         |
| 🖥️ Computer Use    | mouse/keyboard/app automation (Tauri-native Rust)           | ✅         |
| 🌐 Browser Control | Playwright + CloakBrowser stealth automation                | ✅         |
| 📱 Mobile          | React Native Android app, remote pairing                    | ✅         |
| 🔐 Security        | Pairing auth, CSP, input sanitization, CORS                 | ✅         |
| 📦 Build           | Turborepo + pnpm, CI/CD (Windows/Linux/macOS/Android)       | ✅         |
| 🐳 Docker          | Multi-stage sidecar container                               | ✅         |
| 🔔 Notification    | System with priority, channels, DND, history                | ✅ v0.0.5  |
| 💰 Quota           | Rate Limiter + Usage Tracker + BudgetManager                | ✅ v0.0.5  |
| 📊 Monitoring      | ErrorGrouper + AlertEngine + UsageTelemetry                 | ✅ v0.0.5  |
| 🧬 Code Graph      | AST parsing, knowledge graph, symbol search                 | ✅ v0.0.5  |
| 🎤 Voice           | Web Speech API STT, VAD, TTS support                        | ✅ v0.0.5  |
| 🍎 iOS             | Ad-hoc build verified, App Store deferred to 0.0.6          | ✅ v0.0.5  |
| 🛡️ Audit           | 44 findings (P1+P2+P3) all closed                           | ✅ v0.0.5  |

---

## 🔜 In Progress — v0.0.6

| Tính năng                                                          | Target                 | ETA     |
| ------------------------------------------------------------------ | ---------------------- | ------- |
| Plugin Marketplace — install, uninstall, dependency resolution     | `packages/marketplace` | Q3 2026 |
| iOS App Store submission + TestFlight setup                        | `apps/mobile/ios`      | Q3 2026 |
| MCP Server Integration — Model Context Protocol                    | `packages/mcp`         | Q3 2026 |
| Voice improvements — Whisper STT (replace Web Speech API fallback) | `packages/voice`       | Q3 2026 |
| Monitoring v2 — Sentry DSN transport, real performance tracing     | `packages/monitoring`  | Q3 2026 |

---

## 📋 Planned — v0.2.0

| Tính năng                   | Mô tả                                                          | Ưu tiên  |
| --------------------------- | -------------------------------------------------------------- | -------- |
| **MCP Server Integration**  | Model Context Protocol — cho phép AI tools giao tiếp chuẩn hóa | 🔴 Cao   |
| **Offline Mode**            | Cache AI responses, sync queue khi mất mạng                    | 🔴 Cao   |
| **Extension SDK**           | Public API + example plugins cho bên thứ 3                     | 🔴 Cao   |
| **iOS Release**             | Build iOS app + App Store deployment                           | 🔴 Cao   |
| **BLE Fallback**            | Bluetooth Low Energy cho remote control khi không có WiFi      | 🟡 Trung |
| **Visual Regression Tests** | Playwright snapshot diff cho desktop UI                        | 🟡 Trung |
| **Storybook**               | UI component showcase cho desktop app                          | 🟡 Trung |
| **Project Wizard**          | Scaffolding template cho projects mới                          | 🟡 Trung |

---

## 🔮 Future — v0.3.0+

| Tính năng                             | Mô tả                                            |
| ------------------------------------- | ------------------------------------------------ |
| **Native Windows/macOS Code Signing** | Authenticode + notarize cho production releases  |
| **Auto-Update Channel**               | Stable/Beta/Canary release channels              |
| **SBOM Generation**                   | CycloneDX Software Bill of Materials mỗi release |
| **Performance Regression Gate**       | CI tự động cảnh báo nếu benchmark degrade >5%    |
| **Penetration Testing Program**       | Bug bounty + security audit                      |
| **Community Chat**                    | Discord/Slack server cho contributors            |
| **i18n Completion**                   | Full internationalization support                |
| **Desktop Linux Distribution**        | Snap/Flatpak packages                            |

---

## 🤝 Đóng góp

Xem [CONTRIBUTING.md](./CONTRIBUTING.md) để biết cách tham gia phát triển.

> **Lưu ý:** Roadmap này có thể thay đổi dựa trên phản hồi của cộng đồng và ưu tiên kinh doanh.
