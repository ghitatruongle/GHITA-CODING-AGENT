# GHITA CODING AGENT

<div align="center">
  <img src="docs/logo_official.png" alt="GHITA CODING AGENT" width="200">
</div>

<div align="center">

![Version](https://img.shields.io/badge/version-0.0.2-purple.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.6-blue.svg)
![Tauri](https://img.shields.io/badge/tauri-2.x-orange.svg)

</div>

---

<details open>
<summary><b>🇺🇸 English Version</b></summary>

**GHITA CODING AGENT** — A versatile AI desktop application with VS Code-style interface, supporting remote computer control via Android phone.

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

**Important:**
- At minimum, configure one AI provider (OpenAI, Anthropic, Google, or Ollama)
- For local AI, set `OLLAMA_BASE_URL=http://localhost:11434` and ensure Ollama is running
- Default port for Socket.IO server is `8080` (configurable via `SOCKET_PORT`)

### Step 4: Build the sidecar server (required for desktop app)

The desktop app requires a Node.js sidecar server for communication and AI operations:

```bash
# Build the sidecar server bundle
cd apps/desktop/src-tauri/sidecar
node server.mjs --build
cd ../../..
```

### Step 5: Run development

```bash
# Desktop (Tauri + React)
pnpm dev:desktop

# Mobile (React Native - Android)
pnpm dev:android
```

---

## Common Issues & Troubleshooting

### Desktop app won't start
- Ensure Rust is installed: `rustc --version`
- Ensure Node.js >= 20 is installed: `node --version`
- Rebuild the sidecar server if needed
- Check that port 8080 is not already in use

### Mobile app can't connect to desktop
- Ensure both devices are on the same network
- Check that the communication server is running (check Dashboard view)
- Verify the pairing code is correct
- Try using manual IP address instead of cloud discovery

### AI provider not working
- Verify API keys in `.env` file
- Check that the provider is enabled in the API Manager
- For Ollama, ensure it's running: `ollama serve`
- Check network connectivity for cloud providers

### Skills not working
- Some skills require specific adapters (file, terminal, screenshot)
- Computer and browser skills are disabled by default for security
- Enable skills in the Skills view if needed
- Check that required tools are installed (e.g., git, docker)

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
| Update 0.0.2 beta2 | 22/05/2026 | Sandboxed workspace tools (CRUD, pure-Node grep search, block traversal), Socket.IO live telemetry and terminal command approval consent gate, integration testing and compilation |
| Update 0.0.2 | 26/05/2026 | Added 6 breakthrough features: SCTI trajectory self-healing, AST-Lock method protection, Live Telepresence stream, Rust memory addon, AHPI performance heatmap, DebateEngine reviewer panel, and /deep-research command |
| Update 0.0.3 beta1 | 02/06/2026 | Real Terminal PTY (node-pty sidecar), Playwright-Stealth multi-tab browser, Agentic Observe & Act layer, Sandbox guardrails, VS Code extension WebSocket sync, Monaco linter diagnostics & diff view, Mobile touch remote control, Embedded Tauri webview, E2E integration & CI benchmark |

---

## License

[MIT](LICENSE) — Copyright (c) 2026 GHITA CODING AGENT

</details>

<details>
<summary><b>🇻🇳 Phiên bản Tiếng Việt</b></summary>

**GHITA CODING AGENT** — Ứng dụng AI trên máy tính đa năng với giao diện kiểu VS Code, hỗ trợ điều khiển máy tính từ xa qua điện thoại Android.

---

## Tính năng nổi bật

- **Trình soạn thảo mã nguồn** — Lập trình có sự hỗ trợ của AI với Monaco Editor
- **Đa nhà cung cấp AI** — Quản lý OpenAI, Anthropic, Google, Ollama và nhiều nhà cung cấp khác
- **Hệ thống Kỹ năng** — Tạo và quản lý các kỹ năng AI
- **Nhóm Đại lý (Agent Groups)** — Tạo các nhóm đại lý chuyên biệt để cộng tác làm việc
- **Sử dụng Máy tính (Computer Use)** — AI điều khiển chuột, bàn phím và các ứng dụng
- **Điều khiển Trình duyệt** — AI tự động mở Chrome và thực hiện các tác vụ web
- **Điều khiển Từ xa** — Điều khiển máy tính từ xa thông qua điện thoại Android (kết nối WiFi/Socket.IO)
- **Ghép nối An toàn** — Cơ chế xác thực hai chiều an toàn bằng mã pin ghép nối

> **Yêu cầu hệ điều hành Android**: Android 9 (Pie) trở lên (API 28+)

---

## Công nghệ Sử dụng

| Thành phần | Công nghệ |
|---|---|
| Desktop | Tauri 2.x + React (TypeScript) |
| Mobile | React Native (Android) — minSdk=28 |
| AI Engine | Vercel AI SDK / LiteLLM / LangChain.js |
| Browser | Playwright / CloakBrowser |
| Computer Use | nut.js / UI-TARS |
| Giao tiếp | Socket.IO |
| Local AI | Ollama |
| Code Editor | Monaco Editor |
| Terminal | xterm.js + node-pty |
| Build Tool | Turborepo + pnpm workspace |

---

## Cấu trúc Dự án

```
GHITA-CODING-AGENT/
├── apps/
│   ├── desktop/         # Ứng dụng Tauri + React (Windows/Linux)
│   └── mobile/          # Ứng dụng React Native (Android)
├── packages/
│   ├── ai-engine/       # Bộ điều phối đa nhà cung cấp AI
│   ├── skills/          # Hệ thống kỹ năng
│   ├── agents/          # Quản lý đại lý và nhóm đại lý
│   ├── communication/   # Kết nối Desktop ↔ Mobile
│   ├── browser-control/ # Điều khiển trình duyệt (Playwright + CloakBrowser)
│   ├── computer-use/    # Điều khiển máy tính (nut.js + UI-TARS)
│   ├── memory/          # Bộ nhớ của đại lý (AgentMemory)
│   └── shared/          # Tiện ích, kiểu dữ liệu, hằng số dùng chung
├── scripts/             # Kịch bản xây dựng và thiết lập
├── docs/                # Tài liệu hướng dẫn & tài nguyên
├── tests/               # Các bài kiểm thử
└── Plan/                # Kế hoạch phát triển dự án
```

---

## Hướng dẫn Cài đặt

### Yêu cầu hệ thống

- **Node.js** >= 20
- **pnpm** >= 10.x (`npm install -g pnpm`)
- **Rust** (cho ứng dụng máy tính Tauri)
- **Android Studio** (cho ứng dụng di động React Native)
- **Thiết bị/giả lập Android** chạy phiên bản Android 9+ (API 28)
- **Git**

### Bước 1: Nhân bản dự án (Clone)

```bash
git clone https://github.com/ghitatruongle/GHITA-CODING-AGENT.git
cd GHITA-CODING-AGENT
```

### Bước 2: Cài đặt các gói phụ thuộc

```bash
pnpm install
```

### Bước 3: Cấu hình biến môi trường

```bash
cp .env.example .env
# Chỉnh sửa tệp .env và điền các khóa API của bạn
```

Xem tệp [`.env.example`](.env.example) để biết danh sách các biến môi trường bắt buộc.

**Lưu ý quan trọng:**
- Tối thiểu, hãy cấu hình một nhà cung cấp AI (OpenAI, Anthropic, Google hoặc Ollama)
- Đối với AI cục bộ, hãy đặt `OLLAMA_BASE_URL=http://localhost:11434` và đảm bảo Ollama đang chạy
- Cổng mặc định cho Socket.IO server là `8080` (có thể cấu hình qua `SOCKET_PORT`)

### Bước 4: Xây dựng sidecar server (bắt buộc cho ứng dụng desktop)

Ứng dụng desktop yêu cầu một Node.js sidecar server để giao tiếp và các hoạt động AI:

```bash
# Xây dựng gói sidecar server
cd apps/desktop/src-tauri/sidecar
node server.mjs --build
cd ../../..
```

### Bước 5: Khởi chạy môi trường phát triển

```bash
# Ứng dụng Desktop (Tauri + React)
pnpm dev:desktop

# Ứng dụng Di động (React Native - Android)
pnpm dev:android
```

---

## Các Vấn đề Thường Gặp & Khắc Phục Sự Cố

### Ứng dụng desktop không khởi động được
- Đảm bảo Rust đã được cài đặt: `rustc --version`
- Đảm bảo Node.js >= 20 đã được cài đặt: `node --version`
- Xây dựng lại sidecar server nếu cần
- Kiểm tra rằng cổng 8080 không đang được sử dụng bởi ứng dụng khác

### Ứng dụng di động không thể kết nối với desktop
- Đảm bảo cả hai thiết bị đều trên cùng mạng
- Kiểm tra rằng communication server đang chạy (xem Dashboard view)
- Xác minh mã ghép nối (pairing code) là chính xác
- Thử sử dụng địa chỉ IP thủ công thay vì cloud discovery

### Nhà cung cấp AI không hoạt động
- Xác minh các khóa API trong tệp `.env`
- Kiểm tra rằng nhà cung cấp đã được bật trong API Manager
- Đối với Ollama, đảm bảo nó đang chạy: `ollama serve`
- Kiểm tra kết nối mạng cho các nhà cung cấp đám mây

### Kỹ năng (Skills) không hoạt động
- Một số kỹ năng yêu cầu các adapter cụ thể (file, terminal, screenshot)
- Kỹ năng máy tính và trình duyệt bị tắt mặc định vì lý do bảo mật
- Bật kỹ năng trong Skills view nếu cần
- Kiểm tra rằng các công cụ cần thiết đã được cài đặt (ví dụ: git, docker)

---

## Các Lệnh Scripts

| Lệnh | Mô tả |
|---|---|
| `pnpm dev` | Chạy tất cả các dự án con ở chế độ dev |
| `pnpm dev:desktop` | Chạy ứng dụng máy tính (Tauri) |
| `pnpm dev:android` | Chạy ứng dụng Android |
| `pnpm build` | Xây dựng (build) toàn bộ dự án |
| `pnpm build:desktop` | Xây dựng ứng dụng máy tính |
| `pnpm build:android` | Tạo tệp cài đặt Android (.APK) |
| `pnpm build:packages` | Chỉ xây dựng các gói thư viện nội bộ |
| `pnpm lint` | Kiểm tra lỗi cú pháp và định dạng mã |
| `pnpm lint:fix` | Tự động sửa lỗi cú pháp |
| `pnpm typecheck` | Kiểm tra kiểu TypeScript |
| `pnpm format` | Định dạng mã nguồn bằng Prettier |
| `pnpm test` | Chạy các bài kiểm thử |
| `pnpm clean` | Xóa các tệp build tạm |
| `pnpm clean:all` | Xóa tất cả các tệp tạm (bao gồm cả node_modules) |

---

## Nhật ký Thay đổi (Changelog)

| Phiên bản | Ngày | Mô tả |
|---|---|---|
| DEMO | 19/05/2026 | Bản demo phát hành đầu tiên |
| Cập nhật 0.0.1 | 21/05/2026 | Tối ưu kết nối điện thoại-máy tính và sửa các lỗi nhỏ |
| Cập nhật 0.0.2 beta1 | 21/05/2026 | Tích hợp trình biên tập mã kiểu VSCode, Trình quản lý tệp, Đa thẻ (Multi-tab), 13 nhà cung cấp AI, Bảng điều khiển thời gian thực, Thiết kế lại quản lý API, Hiển thị chat định dạng markdown, Bộ đếm token |
| Cập nhật 0.0.2 beta2 | 22/05/2026 | Các công cụ không gian làm việc an toàn (CRUD, tìm kiếm grep thuần Node, duyệt khối), Kết nối Socket.IO trực tiếp và cơ chế phê duyệt lệnh terminal, kiểm thử tích hợp và biên dịch |
| Cập nhật 0.0.2 | 26/05/2026 | Thêm 6 tính năng đột phá: Tự chữa lành quỹ đạo SCTI, Bảo vệ phương thức AST-Lock, Stream hiện diện trực tiếp, Addon bộ nhớ Rust, Bản đồ nhiệt hiệu năng AHPI, Bảng đánh giá tranh biện DebateEngine và lệnh /deep-research |
| Cập nhật 0.0.3 beta1 | 02/06/2026 | Terminal PTY thật (node-pty sidecar), Trình duyệt Playwright-Stealth đa thẻ, Lớp Agentic Observe & Act, Bảo vệ sandbox, VS Code extension đồng bộ WebSocket, Monaco chẩn đoán linter & diff view, Mobile điều khiển cảm ứng từ xa, Tauri webview nhúng, Tích hợp E2E & CI benchmark |

---

## Bản quyền

Sử dụng giấy phép [MIT](LICENSE) — Bản quyền (c) 2026 thuộc về GHITA CODING AGENT

</details>
