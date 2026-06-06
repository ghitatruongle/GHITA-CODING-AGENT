---
id: cli-config
title: CLI Config
sidebar_label: Config
---

# CLI Config

## Locations

| OS | Path |
|----|------|
| Windows | `%APPDATA%\ghita\config.json` |
| macOS | `~/Library/Application Support/ghita/config.json` |
| Linux | `~/.config/ghita/config.json` |

## Schema

Xem [Configuration](/docs/configuration) để biết schema đầy đủ.

## Override per-command

```bash
ghita run "hello" \
  --provider=anthropic \
  --model=claude-3-5-sonnet \
  --log-level=debug
```
