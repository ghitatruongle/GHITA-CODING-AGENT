# GHITA CODING AGENT

<div align="center">
  <img src="docs/logo_official.png" alt="GHITA CODING AGENT" width="200">
</div>

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.6-blue.svg)
![Tauri](https://img.shields.io/badge/tauri-2.x-orange.svg)

</div>

**AI Desktop Agent** — Ứng dụng desktop AI đa năng, giao diện kiểu VS Code, hỗ trợ điều khiển máy tính từ xa qua điện thoại Android.

---

## Tính năng

- **Code Editor** — AI-assisted coding với Monaco Editor
- **AI Multi-Provider** — Quản lý OpenAI, Anthropic, Google, Ollama...
- **Skill System** — Tạo/quản lý kỹ năng cho AI
- **Agent Groups** — Tạo nhóm agents chuyên biệt
- **Computer Use** — AI điều khiển chuột, bàn phím, ứng dụng
- **Browser Control** — AI mở Chrome, tự động hóa web
- **Remote Control** — Điều khiển từ xa qua Android (WiFi/Socket.IO)
- **Secure Pairing** — Mã xác thực 2 chiều an toàn

> **Yêu cầu Android**: Android 9 (Pie) trở lên (API 28+)

---

## Tech Stack

| Thành phần | Technology |
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

## Cấu trúc dự án

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
└── Plan/                # Kế hoạch phát triển
```

---

## Cài đặt

### Yêu cầu

- **Node.js** >= 20
- **pnpm** >= 10.x (`npm install -g pnpm`)
- **Rust** (cho Tauri desktop)
- **Android Studio** (cho React Native)
- **Android device/emulator** chạy Android 9+ (API 28)
- **Git**

### Bước 1: Clone dự án

```bash
git clone https://github.com/ghitatruongle/GHITA-CODING-AGENT.git
cd GHITA-CODING-AGENT
```

### Bước 2: Cài đặt dependencies

```bash
pnpm install
```

### Bước 3: Cấu hình environment

```bash
cp .env.example .env
# Chỉnh sửa .env với API keys của bạn
```

Xem [`.env.example`](.env.example) để biết các biến môi trường cần thiết.

### Bước 4: Chạy development

```bash
# Desktop (Tauri + React)
pnpm dev:desktop

# Mobile (React Native - Android)
pnpm dev:android
```

---

## Scripts

| Script | Mô tả |
|---|---|
| `pnpm dev` | Chạy tất cả workspace ở dev mode |
| `pnpm dev:desktop` | Chạy desktop app (Tauri) |
| `pnpm dev:android` | Chạy Android app |
| `pnpm build` | Build tất cả |
| `pnpm build:desktop` | Build desktop app |
| `pnpm build:android` | Build Android APK |
| `pnpm build:packages` | Build chỉ packages |
| `pnpm lint` | Kiểm tra code style |
| `pnpm lint:fix` | Tự động fix lint |
| `pnpm typecheck` | Kiểm tra TypeScript |
| `pnpm format` | Format code với Prettier |
| `pnpm test` | Chạy tests |
| `pnpm clean` | Xóa build artifacts |
| `pnpm clean:all` | Xóa tất cả (bao gồm node_modules) |

---

## Lịch sử cập nhật

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| DEMO | 19/05/2026 | Bản demo đầu tiên |
| Update 0.0.1 | 21/05/2026 | Tối ưu cho việc kết nối giữa điện thoại và máy tính và sửa một số lỗi nhỏ |

---

## License

[MIT](LICENSE) — Copyright (c) 2026 GHITA CODING AGENT
