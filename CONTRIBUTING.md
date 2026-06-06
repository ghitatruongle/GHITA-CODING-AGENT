# Contributing to GHITA CODING AGENT

---

<details open>
<summary><b>🇺🇸 English Version</b></summary>

Thank you for your interest in the project! Here are the contribution guidelines.

## Requirements

- Node.js >= 20.0.0
- pnpm >= 10.x
- Rust (for Tauri desktop)
- Android Studio (for mobile)

## Getting Started

```bash
# Clone repo
git clone https://github.com/ghitatruongle/GHITA-CODING-AGENT.git
cd GHITA-CODING-AGENT

# Install dependencies
pnpm install

# Run desktop dev
pnpm dev:desktop

# Run mobile dev
pnpm dev:android
```

## Contribution Workflow

1. Fork the repo
2. Create a branch: `git checkout -b feat/feature-name`
3. Commit: `git commit -m "feat: describe feature"`
4. Push: `git push origin feat/feature-name`
5. Create a Pull Request

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `style:` — Code formatting
- `refactor:` — Code refactoring
- `test:` — Add/update tests
- `chore:` — Other tasks

## Code Style

- TypeScript strict mode
- Prettier formatting (`.prettierrc`)
- ESLint rules (`eslint.config.js`)
- Run `pnpm lint` and `pnpm typecheck` before committing

## Project Structure

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
└── refer_project/  # Reference open-source projects (not project code)
```

## Pull Request Guidelines

### Before Creating a PR

- [ ] Code runs (`pnpm dev:desktop` or `pnpm dev:android`)
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] Passes lint (`pnpm lint`)
- [ ] Code is formatted (`pnpm format:check`)

### PR Rules

- **Concise**: 1 PR = 1 feature or 1 bug fix. Avoid oversized PRs.
- **Clear description**: Explain _why_ the change, not just _what_.
- **Screenshots/Video**: If UI changes, attach images or video.
- **Linked Issues**: Link related issue (if any) using `Fixes #123`.
- **Draft PR**: If work-in-progress, create a Draft PR first.

### PR Template

```markdown
## Description

[Brief explanation of the change]

## Type of Change

- [ ] New feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactor

## How to Test

1. [Step 1]
2. [Step 2]

## Screenshots (if applicable)
```

## Bug Reports

Use [GitHub Issues](https://github.com/ghitatruongle/GHITA-CODING-AGENT/issues) to report bugs.

</details>

<details>
<summary><b>🇻🇳 Phiên bản Tiếng Việt</b></summary>

Cảm ơn sự quan tâm của bạn dành cho dự án! Dưới đây là các hướng dẫn khi tham gia đóng góp mã nguồn.

## Yêu cầu Hệ thống

- Node.js >= 20.0.0
- pnpm >= 10.x
- Rust (dành cho ứng dụng máy tính Tauri)
- Android Studio (dành cho thiết bị di động)

## Bắt đầu nhanh

```bash
# Nhân bản dự án (Clone)
git clone https://github.com/ghitatruongle/GHITA-CODING-AGENT.git
cd GHITA-CODING-AGENT

# Cài đặt gói phụ thuộc
pnpm install

# Khởi chạy ứng dụng máy tính ở chế độ dev
pnpm dev:desktop

# Khởi chạy ứng dụng di động ở chế độ dev
pnpm dev:android
```

## Quy trình Đóng góp

1. Fork kho lưu trữ (repo) này
2. Tạo nhánh mới: `git checkout -b feat/ten-tinh-nang`
3. Commit thay đổi: `git commit -m "feat: mo ta tinh nang"`
4. Đẩy lên nhánh trên repo fork: `git push origin feat/ten-tinh-nang`
5. Tạo một Pull Request (yêu cầu kéo mã - PR)

## Quy chuẩn Commit

Sử dụng chuẩn [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — Tính năng mới
- `fix:` — Sửa lỗi
- `docs:` — Cập nhật tài liệu
- `style:` — Định dạng mã nguồn (không thay đổi logic)
- `refactor:` — Tái cấu trúc mã nguồn
- `test:` — Thêm hoặc cập nhật các bài kiểm thử (test)
- `chore:` — Các thay đổi nhỏ khác (không ảnh hưởng trực tiếp đến tính năng)

## Phong cách Lập trình

- Sử dụng chế độ nghiêm ngặt (strict mode) của TypeScript
- Tuân thủ định dạng mã nguồn Prettier (`.prettierrc`)
- Tuân thủ quy tắc ESLint (`eslint.config.js`)
- Hãy chạy lệnh `pnpm lint` và `pnpm typecheck` trước khi thực hiện commit

## Cấu trúc Dự án

```
├── apps/
│   ├── desktop/    # Ứng dụng máy tính sử dụng Tauri + React
│   └── mobile/     # Ứng dụng Android viết bằng React Native
├── packages/
│   ├── shared/     # Các kiểu dữ liệu, hằng số, bộ logger và tiện ích dùng chung
│   ├── ai-engine/  # Bộ điều phối đa nhà cung cấp AI
│   ├── skills/     # Bộ đăng ký và quản lý kỹ năng AI
│   ├── agents/     # Bộ quản lý và thiết lập đại lý AI
│   ├── browser-control/
│   ├── computer-use/
│   ├── communication/
│   └── memory/
└── refer_project/  # Các dự án mã nguồn mở tham khảo (không thuộc mã nguồn dự án)
```

## Hướng dẫn gửi Pull Request (PR)

### Trước khi tạo PR

- [ ] Dự án khởi chạy ổn định (`pnpm dev:desktop` hoặc `pnpm dev:android`)
- [ ] Không có lỗi kiểm tra kiểu TypeScript (`pnpm typecheck`)
- [ ] Vượt qua tất cả kiểm tra cú pháp (`pnpm lint`)
- [ ] Mã nguồn đã được định dạng chuẩn xác (`pnpm format:check`)

### Quy tắc PR

- **Ngắn gọn, tập trung**: Mỗi PR chỉ nên thực hiện 1 tính năng hoặc 1 sửa lỗi. Tránh các PR quá lớn và chứa quá nhiều thay đổi không liên quan.
- **Mô tả rõ ràng**: Giải thích _tại sao (why)_ thay đổi này cần thiết, chứ không chỉ nêu _cái gì (what)_ đã thay đổi.
- **Ảnh chụp / Video**: Nếu thay đổi liên quan đến giao diện người dùng (UI), hãy đính kèm hình ảnh hoặc video minh họa.
- **Liên kết Issues**: Liên kết đến issue liên quan (nếu có) bằng cú pháp `Fixes #123`.
- **PR Nháp (Draft PR)**: Nếu công việc chưa hoàn tất nhưng muốn thảo luận trước, hãy tạo Draft PR.

### Biểu mẫu PR

```markdown
## Description

[Mô tả ngắn gọn về những thay đổi trong PR này]

## Type of Change

- [ ] New feature (Tính năng mới)
- [ ] Bug fix (Sửa lỗi)
- [ ] Documentation (Cập nhật tài liệu)
- [ ] Refactor (Tái cấu trúc)

## How to Test

1. [Bước kiểm thử 1]
2. [Bước kiểm thử 2]

## Screenshots (if applicable)
```

## Báo cáo lỗi

Sử dụng mục [GitHub Issues](https://github.com/ghitatruongle/GHITA-CODING-AGENT/issues) để báo cáo lỗi hoặc đề xuất tính năng mới.

</details>
