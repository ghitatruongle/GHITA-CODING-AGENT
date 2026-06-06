---
id: api-overview
title: API Overview
sidebar_label: Overview
sidebar_position: 0
---

# API Reference

Auto-generated API reference cho tất cả packages.

> **Note:** Docs này được generate từ TSDoc comments. Để regenerate:
>
> ```bash
> pnpm --filter @ghita/docs generate-api
> ```

## Quy ước

Mỗi package có file `index.ts` là public entry. Mọi export từ đó đều được coi là **stable API**.

Internal modules (sub-folder) là **implementation detail** và có thể thay đổi.

## Packages

- [shared](./packages/shared)
- [ai-engine](./packages/ai-engine)
- [agents](./packages/agents)
- [memory](./packages/memory)
- [skills](./packages/skills)
- [communication](./packages/communication)
- [code-graph](./packages/code-graph)
- [marketplace](./packages/marketplace)
- [monitoring](./packages/monitoring)
- [quotas](./packages/quotas)
- [security](./packages/security)
- [browser-control](./packages/browser-control)
- [computer-use](./packages/computer-use)
- [relay-server](./packages/relay-server)

## CLI

- [Commands](./cli/commands)
- [Config](./cli/config)
