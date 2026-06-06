---
id: intro
title: Welcome to GHITA CODING AGENT
sidebar_label: Introduction
sidebar_position: 0
slug: /
---

# GHITA CODING AGENT

**Multi-provider desktop AI agent với skills, computer use, và memory layer** — built for developers who need full control.

## Tính năng chính

- **30+ LLM providers** — OpenAI, Anthropic, Google, Groq, DeepSeek, Kimi, MiniMax, OpenRouter, v.v.
- **Skills marketplace** — community-contributed automation scripts
- **Computer use** — điều khiển desktop, browser, terminal qua natural language
- **Memory layer** — long-term context, semantic search, knowledge graph
- **Multi-platform** — Desktop (Tauri), Android, VS Code Extension
- **Local-first** — mọi data ở local, chỉ gọi LLM khi cần

## Cài đặt nhanh

```bash
git clone https://github.com/ghitatruongle/ghita-coding-agent
cd ghita-coding-agent
pnpm install
pnpm dev:desktop
```

## Kiến trúc tổng quan

```
apps/        — desktop, mobile, vscode-extension
packages/    — 15+ packages (shared, ai-engine, memory, ...)
docs/        — bạn đang ở đây
Plan/        — sprint plan, phase specs
```

Xem [Getting Started](./docs/getting-started) để bắt đầu, hoặc [Architecture](./docs/architecture) để hiểu hệ thống.

## Version hiện tại

**0.0.3** — Sprint 7 (UX & Automation). Xem [Changelog](./docs/changelog).
