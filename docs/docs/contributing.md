---
id: contributing
title: Contributing
sidebar_label: Contributing
sidebar_position: 4
---

# Contributing Guide

Cảm ơn bạn đã quan tâm đến GHITA! Mọi contribution đều welcome.

## Workflow

1. **Fork** repo
2. Tạo **branch**: `git checkout -b feat/my-feature`
3. **Commit** với message rõ ràng (conventional commits)
4. **Push** & tạo **Pull Request**
5. Đợi **review** (ít nhất 1 maintainer)

## Commit message format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Ví dụ:
```
feat(ai-engine): add kimi provider via defineVendor

Refs: fix-phase6.md
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

## Coding standards

- TypeScript strict mode
- ESLint + Prettier
- 100% type coverage trong public API
- JSDoc cho mọi export
- Test với Deno test runner

## Test

```bash
pnpm test
pnpm typecheck
pnpm lint
```

## Phase spec format

Mỗi phase lớn có 1 file `Plan/fix-phase{N}.md` mô tả:

1. Tổng quan kiến trúc
2. Deliverables (file-level)
3. Code blocks paste-ready
4. Test nhanh
5. Tổng kết bảng

Xem `Plan/fix-phase6.md` làm template.
