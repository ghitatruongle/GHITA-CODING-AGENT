# GHITA CODING AGENT

AI Desktop Agent - Điều khiển máy tính từ xa qua điện thoại

## Tổng quan

GHITA CODING AGENT là ứng dụng desktop AI đa năng với giao diện tương tự VS Code, hỗ trợ:

- **Code Editor** — AI-assisted coding với Monaco Editor
- **API Management** — Quản lý multi-provider (OpenAI, Anthropic, Google, Ollama...)
- **Skill System** — Tạo/quản lý kỹ năng cho AI
- **Agent Groups** — Tạo nhóm agents chuyên biệt
- **Computer Use** — AI điều khiển chuột, bàn phím, ứng dụng
- **Browser Control** — AI mở Chrome, tự động hóa web
- **Remote Control** — Điều khiển từ xa qua Android (WiFi/Bluetooth)
- **Secure Pairing** — Mã xác thực 2 chiều an toàn

## Tech Stack

| Thành phần | Technology |
|---|---|
| Desktop | Tauri + React (TypeScript) |
| Mobile | React Native (Android) |
| AI Engine | Vercel AI SDK / LiteLLM / LangChain.js |
| Browser | Playwright / CloakBrowser |
| Computer Use | nut.js / UI-TARS |
| Communication | Socket.io |
| Local AI | Ollama |
| Code Editor | Monaco Editor |
| Terminal | xterm.js + node-pty |

## Cấu trúc dự án

```
GHITA-CODING-AGENT/
├── apps/
│   ├── desktop/         # Tauri + React (Win/Linux)
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
├── refer_project/       # 33 dự án open-source tham khảo
├── scripts/             # Build & setup scripts
├── docs/                # Documentation
├── tests/               # Tests
└── Plan/                # Ý tưởng & kế hoạch
```

## Cài đặt

### Yêu cầu

- Node.js >= 20
- Rust (cho Tauri)
- Android Studio (cho React Native)
- Git

### Bước 1: Clone dự án

```bash
git clone https://github.com/YOUR_USERNAME/GHITA-CODING-AGENT.git
cd GHITA-CODING-AGENT
```

### Bước 2: Clone refer projects

```bash
bash scripts/clone-refer.sh
```

### Bước 3: Cài đặt dependencies

```bash
npm install
```

### Bước 4: Chạy development

```bash
# Desktop
npm run dev:desktop

# Mobile
npm run dev:mobile
```

## 33 dự án open-source tích hợp

Xem chi tiết: [`refer_project/reference.md`](refer_project/reference.md)

| Category | Số lượng | Ví dụ |
|---|---|---|
| AI Core | 9 | Claude Code, OpenClaw, OpenClaude, Open Interpreter... |
| AI Framework | 4 | LangChain.js, LiteLLM, Vercel AI SDK, CrewAI |
| AI Tools | 6 | Aider, Continue, SWE-agent, Skills... |
| Browser | 5 | Playwright, Browser Use, CloakBrowser... |
| Desktop | 6 | Tauri, React Native, nut.js, Monaco Editor... |
| Infra | 2 | Socket.io, Ollama |
| Memory | 1 | AgentMemory |

## License

MIT
