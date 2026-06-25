# 🗺️ GHITA CODING AGENT — Public Roadmap

> **Current version:** v0.0.4
> **Last updated:** 2026-06-24

---

## ✅ Done — v0.1.0 Foundation

| Khu vực | Tính năng | Trạng thái |
|---|---|---|
| 🧠 AI Engine | Multi-provider (OpenAI, Anthropic, Google, Ollama, LiteLLM) | ✅ |
| 🧠 AI Engine | Adaptive Router — complexity-based model selection | ✅ |
| 🧠 AI Engine | Cost Tracking & Budget Alerts | ✅ |
| 🧠 AI Engine | Tool Registry + Composio (200+ tools) | ✅ |
| 🤖 Agents | ReAct Runtime + DAG Flow Orchestrator | ✅ |
| 🤖 Agents | Sub-Agent Spawner (isolated context) | ✅ |
| 🤖 Agents | Agent Groups — specialized teams | ✅ |
| 🎯 Skills | Skill create/edit/run system | ✅ |
| 🖥️ Computer Use | mouse/keyboard/app automation (Tauri-native Rust) | ✅ |
| 🌐 Browser Control | Playwright + CloakBrowser stealth automation | ✅ |
| 📱 Mobile | React Native Android app, remote pairing | ✅ |
| 🔐 Security | Pairing auth, CSP, input sanitization, CORS | ✅ |
| 📦 Build | Turborepo + pnpm, CI/CD (Windows/Linux/macOS/Android) | ✅ |
| 🐳 Docker | Multi-stage sidecar container | ✅ |

---

## 🔜 In Progress — v0.1.0 (current sprint)

| Tính năng | Target | ETA |
|---|---|---|
| Code Knowledge Graph — AST parsing, dependency graph, symbol search | `packages/code-graph` | Q3 2026 |
| Plugin Marketplace — install, uninstall, dependency resolution | `packages/marketplace` | Q3 2026 |
| Voice I/O — Whisper STT, TTS, wake-word detection | `packages/voice` | Q3 2026 |
| iOS build pipeline & App Store preparation | `apps/mobile/ios` | Q3 2026 |
| Notification system — priority, channels, DND | `packages/notification` | Q3 2026 |
| Rate Limiting & Quota Management | `packages/quotas` | Q3 2026 |
| Monitoring & Performance Tracing (Sentry) | `packages/monitoring` | Q3 2026 |

---

## 📋 Planned — v0.2.0

| Tính năng | Mô tả | Ưu tiên |
|---|---|---|
| **MCP Server Integration** | Model Context Protocol — cho phép AI tools giao tiếp chuẩn hóa | 🔴 Cao |
| **Offline Mode** | Cache AI responses, sync queue khi mất mạng | 🔴 Cao |
| **Extension SDK** | Public API + example plugins cho bên thứ 3 | 🔴 Cao |
| **iOS Release** | Build iOS app + App Store deployment | 🔴 Cao |
| **BLE Fallback** | Bluetooth Low Energy cho remote control khi không có WiFi | 🟡 Trung |
| **Visual Regression Tests** | Playwright snapshot diff cho desktop UI | 🟡 Trung |
| **Storybook** | UI component showcase cho desktop app | 🟡 Trung |
| **Project Wizard** | Scaffolding template cho projects mới | 🟡 Trung |

---

## 🔮 Future — v0.3.0+

| Tính năng | Mô tả |
|---|---|
| **Native Windows/macOS Code Signing** | Authenticode + notarize cho production releases |
| **Auto-Update Channel** | Stable/Beta/Canary release channels |
| **SBOM Generation** | CycloneDX Software Bill of Materials mỗi release |
| **Performance Regression Gate** | CI tự động cảnh báo nếu benchmark degrade >5% |
| **Penetration Testing Program** | Bug bounty + security audit |
| **Community Chat** | Discord/Slack server cho contributors |
| **i18n Completion** | Full internationalization support |
| **Desktop Linux Distribution** | Snap/Flatpak packages |

---

## 🤝 Đóng góp

Xem [CONTRIBUTING.md](./CONTRIBUTING.md) để biết cách tham gia phát triển.

> **Lưu ý:** Roadmap này có thể thay đổi dựa trên phản hồi của cộng đồng và ưu tiên kinh doanh.
