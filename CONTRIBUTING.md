# Contributing to GHITA CODING AGENT

Cảm ơn bạn đã quan tâm đến dự án! Dưới đây là hướng dẫn đóng góp.

## Yêu cầu

- Node.js >= 20.0.0
- pnpm >= 10.x
- Rust (cho Tauri desktop)
- Android Studio (cho mobile)

## Bắt đầu

```bash
# Clone repo
git clone https://github.com/ghitatruongle/GHITA-CODING-AGENT.git
cd GHITA-CODING-AGENT

# Cài dependencies
pnpm install

# Chạy desktop dev
pnpm dev:desktop

# Chạy mobile dev
pnpm dev:mobile
```

## Quy trình đóng góp

1. Fork repo
2. Tạo branch: `git checkout -b feat/ten-feature`
3. Commit: `git commit -m "feat: mo ta feature"`
4. Push: `git push origin feat/ten-feature`
5. Tạo Pull Request

## Commit Convention

Sử dụng [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — Tính năng mới
- `fix:` — Sửa bug
- `docs:` — Tài liệu
- `style:` — Format code
- `refactor:` — Tái cấu trúc
- `test:` — Thêm/sửa test
- `chore:` — Công việc khác

## Code Style

- TypeScript strict mode
- Prettier formatting (`.prettierrc`)
- ESLint rules (`eslint.config.js`)
- Chạy `pnpm lint` và `pnpm typecheck` trước khi commit

## Cấu trúc dự án

```
├── apps/
│   ├── desktop/    # Tauri + React desktop app
│   └── mobile/     # React Native Android app
├── packages/
│   ├── shared/     # Types, constants, utils, logger
│   ├── ai-engine/  # Multi-provider AI engine
│   ├── skills/     # Skill registry
│   ├── agents/     # Agent management
│   ├── browser-control/
│   ├── computer-use/
│   ├── communication/
│   └── memory/
└── refer_project/  # Reference open-source projects
```

## Báo cáo lỗi

Sử dụng [GitHub Issues](https://github.com/ghitatruongle/GHITA-CODING-AGENT/issues) để báo cáo lỗi.
