---
id: cli-commands
title: CLI Commands
sidebar_label: Commands
---

# CLI Commands

## `ghita` — main command

```bash
ghita [command] [options]
```

| Command | Mô tả |
|---------|-------|
| `ghita chat` | Mở interactive chat |
| `ghita run "<prompt>"` | Chạy 1 lần rồi thoát |
| `ghita skill` | Quản lý skills |
| `ghita marketplace` | Browse/install skills |
| `ghita memory` | Inspect memory |
| `ghita config` | Đọc/sửa config |
| `ghita doctor` | Kiểm tra môi trường |
| `ghita update` | Auto-update |

## Options

| Flag | Mô tả |
|------|-------|
| `--config <path>` | Đường dẫn config file |
| `--log-level <level>` | `debug` \| `info` \| `warn` \| `error` |
| `--no-telemetry` | Tắt telemetry |
| `--provider <id>` | Override provider |
| `--model <id>` | Override model |
| `--json` | Output JSON (cho scripting) |
