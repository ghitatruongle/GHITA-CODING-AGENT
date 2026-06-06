---
id: packages
title: Packages
sidebar_label: Packages
sidebar_position: 2
---

# Packages

Danh sách tất cả packages trong monorepo.

## Core

| Package | Mô tả | Phase |
|---------|-------|-------|
| `@ghita/shared` | Types, constants, utilities dùng chung | 1 |
| `@ghita/ai-engine` | 30+ LLM providers, routing, cache, batch | 6-30 |
| `@ghita/agents` | Agent orchestrator, planner, executor | 2-3 |
| `@ghita/skills` | Skill registry & runner | 5 |
| `@ghita/memory` | Long-term memory, RAG, knowledge graph | 4-30 |
| `@ghita/marketplace` | Community skill marketplace | 7 |

## Communication & I/O

| Package | Mô tả | Phase |
|---------|-------|-------|
| `@ghita/communication` | WebSocket multiplexer, IPC | 11-29 |
| `@ghita/browser-control` | Playwright-based browser automation | 9 |
| `@ghita/computer-use` | Desktop control (mouse, keyboard, screen) | 10 |

## Infrastructure

| Package | Mô tả | Phase |
|---------|-------|-------|
| `@ghita/monitoring` | Error tracking, performance tracing, alerts | 32 |
| `@ghita/quotas` | Rate limiting, token quotas, billing | 33 |
| `@ghita/security` | Input sanitization, CORS audit, key rotation | 34 |
| `@ghita/relay-server` | Cloud relay cho mobile pairing | 12 |

## Developer tools

| Package | Mô tả | Phase |
|---------|-------|-------|
| `@ghita/code-graph` | AST parsing, dependency graph | 8 |
