# GHITA CODING AGENT

<div align="center">
  <img src="docs/logo_official.png" alt="GHITA CODING AGENT" width="200">
</div>

<div align="center">

![Version](https://img.shields.io/badge/version-0.0.2--beta1-purple.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.6-blue.svg)
![Tauri](https://img.shields.io/badge/tauri-2.x-orange.svg)

</div>

**AI Desktop Agent** — A versatile AI desktop application with VS Code-style interface, supporting remote computer control via Android phone.

---

## Features

- **Code Editor** — AI-assisted coding with Monaco Editor
- **AI Multi-Provider** — Manage OpenAI, Anthropic, Google, Ollama and more
- **Skill System** — Create and manage AI skills
- **Agent Groups** — Create specialized agent teams
- **Computer Use** — AI controls mouse, keyboard, and applications
- **Browser Control** — AI opens Chrome, automates web tasks
- **Remote Control** — Remote control via Android (WiFi/Socket.IO)
- **Secure Pairing** — Secure two-way authentication code

> **Android Requirement**: Android 9 (Pie) or higher (API 28+)

---

## Tech Stack

| Component | Technology |
|---|---|
| Desktop | Tauri 2.x + React (TypeScript) |
| Mobile | React Native (Android) — minSdk=28 |
| AI Engine | Vercel AI SDK / LiteLLM / LangChain.js |
| Browser | Playwright / CloakBrowser |
| Computer Use | nut.js / UI-TARS |
| Communication | Socket.IO |
| Local AI | Ollama |
| Code Editor | Monaco Editor |
| Terminal | xterm.js + node-pty |
| Build | Turborepo + pnpm workspace |

---

## Project Structure

```
GHITA-CODING-AGENT/
├── apps/
│   ├── desktop/         # Tauri + React (Windows/Linux)
│   └── mobile/          # React Native (Android)
├── packages/
│   ├── ai-engine/       # AI multi-provider orchestration
│   ├── skills/          # Skill system
│   ├── agents/          # Agent & group management
│   ├── communication/   # Desktop ↔ Mobile
│   ├── browser-control/ # Playwright + CloakBrowser
│   ├── computer-use/    # nut.js + UI-TARS
│   ├── memory/          # AgentMemory
│   └── shared/          # Utils, types, constants
├── scripts/             # Build & setup scripts
├── docs/                # Documentation & assets
├── tests/               # Tests
└── Plan/                # Development plan
```

---

## Installation

### Requirements

- **Node.js** >= 20
- **pnpm** >= 10.x (`npm install -g pnpm`)
- **Rust** (for Tauri desktop)
- **Android Studio** (for React Native)
- **Android device/emulator** running Android 9+ (API 28)
- **Git**

### Step 1: Clone the project

```bash
git clone https://github.com/ghitatruongle/GHITA-CODING-AGENT.git
cd GHITA-CODING-AGENT
```

### Step 2: Install dependencies

```bash
pnpm install
```

### Step 3: Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

See [`.env.example`](.env.example) for required environment variables.

### Step 4: Run development

```bash
# Desktop (Tauri + React)
pnpm dev:desktop

# Mobile (React Native - Android)
pnpm dev:android
```

---

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Run all workspaces in dev mode |
| `pnpm dev:desktop` | Run desktop app (Tauri) |
| `pnpm dev:android` | Run Android app |
| `pnpm build` | Build everything |
| `pnpm build:desktop` | Build desktop app |
| `pnpm build:android` | Build Android APK |
| `pnpm build:packages` | Build packages only |
| `pnpm lint` | Check code style |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm typecheck` | Check TypeScript |
| `pnpm format` | Format code with Prettier |
| `pnpm test` | Run tests |
| `pnpm clean` | Remove build artifacts |
| `pnpm clean:all` | Remove everything (including node_modules) |

---

## Changelog

| Version | Date | Description |
|---|---|---|
| DEMO | 19/05/2026 | Initial demo release |
| Update 0.0.1 | 21/05/2026 | Optimized phone-computer connection and fixed minor bugs |
| Update 0.0.2 beta1 | 21/05/2026 | Code Editor VSCode-style, File Explorer, Multi-tab, 13 AI providers, Dashboard real-time, API Manager redesign, Chat markdown rendering, Token counter |

---

## License

[MIT](LICENSE) — Copyright (c) 2026 GHITA CODING AGENT
