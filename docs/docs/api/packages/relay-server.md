---
id: packages-relay-server
title: @ghita/relay-server
sidebar_label: relay-server
---

# @ghita/relay-server

Cloud relay cho mobile pairing & remote control.

```bash
pnpm --filter @ghita/relay-server dev
```

Listen ở `:3000` mặc định. Endpoints:

- `POST /pair` — tạo pairing code
- `GET /pair/:code` — verify code
- `WS /ws` — bidirectional message channel
- `GET /health` — health check
