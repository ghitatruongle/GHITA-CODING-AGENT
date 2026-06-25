---
id: configuration
title: Configuration
sidebar_label: Configuration
sidebar_position: 3
---

# Configuration

GHITA đọc config từ nhiều nguồn (priority cao → thấp):

1. Environment variables (`GHITA_*`)
2. `~/.ghita/config.json`
3. Project-local `.ghitarc.json`
4. Defaults

## File structure

```json
// ~/.ghita/config.json
{
  "version": "0.0.3",
  "providers": {
    "openai": {
      "apiKey": "${OPENAI_API_KEY}",
      "defaultModel": "gpt-4o",
      "enabled": true
    },
    "anthropic": {
      "apiKey": "${ANTHROPIC_API_KEY}",
      "defaultModel": "claude-3-5-sonnet"
    }
  },
  "agents": {
    "maxConcurrent": 4,
    "defaultTimeoutMs": 60000
  },
  "memory": {
    "maxEntries": 10000,
    "decayHalfLife": 7
  },
  "monitoring": {
    "enabled": true,
    "sentry": {
      "dsn": "${SENTRY_DSN}",
      "environment": "production"
    }
  },
  "quotas": {
    "free": {
      "tokenLimit": 100000,
      "window": "month"
    }
  }
}
```

## Environment variables

| Var                 | Mô tả                                              |
| ------------------- | -------------------------------------------------- |
| `GHITA_CONFIG_PATH` | Đường dẫn config (default: `~/.ghita/config.json`) |
| `GHITA_LOG_LEVEL`   | `debug` \| `info` \| `warn` \| `error`             |
| `GHITA_TELEMETRY`   | `on` \| `off`                                      |
| `OPENAI_API_KEY`    | OpenAI key                                         |
| `ANTHROPIC_API_KEY` | Anthropic key                                      |
| `GOOGLE_API_KEY`    | Google AI key                                      |
| `SENTRY_DSN`        | Sentry DSN                                         |
