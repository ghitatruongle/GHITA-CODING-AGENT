---
id: packages-overview
title: Tổng quan packages
sidebar_position: 4
---

# Tổng quan packages

GHITA là một monorepo gồm 13+ packages trong `packages/`. Mỗi package có trách nhiệm riêng, phụ thuộc vào `@ghita/shared` cho types chung.

## Core packages

### `@ghita/ai-engine`
Multi-provider LLM abstraction với streaming, MCP transport, prompts-as-code.
- Unified `LLMProvider` interface
- SSE streaming parser
- 12-factor prompts as code (YAML registry)
- Human-in-the-Loop tools với approval gate

### `@ghita/agents`
Agent core — reducer pattern, flow control, thread resume.
- `processEvent(state, event)` reducer
- Event types: message, tool_call, error
- `POST /threads/:id/resume` API
- Idempotency + replay support

### `@ghita/skills`
Skill manifest, hot reload, hub, registry.
- `SKILL.md` loader với frontmatter
- File watcher cho hot reload
- Skills Hub + `lock.json`
- `SkillGuard` content-hash + `TRUSTED_REPOS`

### `@ghita/memory`
Tiered memory storage, graph algorithms.
- Tier 1: Working memory (in-process)
- Tier 2: Session store (SQLite)
- Tier 3: Long-term (vector DB)
- PageRank centrality
- Memory freshness (exponential decay)
- Connection path + associations

## Communication packages

### `@ghita/communication`
Multi-channel messaging adapters.
- `defineChannelEntry` plugin contract
- Telegram (grammY)
- Discord (discord.js)
- WhatsApp (linked-device WebSocket)
- iMessage (imsg binary)
- Slack (socket mode)
- SSRF filter cho outbound HTTP

### `@ghita/computer-use`
Desktop/mobile control operators.
- NutJSOperator (desktop screenshot + actions)
- MobileAdbOperator (Android)
- 3 control strategies: browser-only, gui-only, mixed
- ReAct loop: screenshot → model → action

### `@ghita/browser-control`
Browser automation với CDP + Selenium fallback.
- Accessibility tree parsing
- Full AX tree extraction
- WebDriver management

## Data & Analysis

### `@ghita/code-graph`
AST + dependency graph.
- Function/class/module extraction
- Import + call graph
- Symbol search
- Neo4j / SQLite adapter

### `@ghita/marketplace`
Plugin marketplace, publishing pipeline.
- Plugin manifest (package.json)
- Install/uninstall/update CLI
- Agent template gallery
- Skill → npm conversion
- Revenue sharing, analytics, community

## Infrastructure

### `@ghita/security`
Security audit & prevention. ([Xem chi tiết →](./security))
- Input sanitizer (XSS, SQLi, command injection, path traversal)
- XSS prevention với whitelist
- CORS policy manager
- API key rotation (90-day policy)

### `@ghita/monitoring`
Error monitoring (Sentry-compatible), performance tracing, alerts. ([Xem chi tiết →](./monitoring))
- HTTP client gửi envelope format
- Performance transactions + spans
- Error grouping (fingerprinting)
- Sliding-window alert engine

### `@ghita/quotas`
Rate limiting & quota management. ([Xem chi tiết →](./quotas))
- Token bucket, sliding window, fixed window
- Per-user (free/pro/team/enterprise) tiers
- Overage billing hooks
- Usage dashboard

### `@ghita/relay-server`
Tauri-side HTTP relay server — mount channels, expose internal APIs.

### `@ghita/shared`
Types, constants, utilities dùng chung.
- Common types (Result, Option, etc.)
- Constants
- Better-sqlite3 wrapper
- Tree-sitter bindings
