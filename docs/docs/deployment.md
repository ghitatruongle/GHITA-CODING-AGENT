---
id: deployment
title: Deployment
sidebar_label: Deployment
sidebar_position: 1
---

# Deployment

## Desktop auto-update

Tauri config auto-update từ GitHub Releases:

```json
// src-tauri/tauri.conf.json
{
  "updater": {
    "active": true,
    "dialog": true,
    "endpoints": ["https://github.com/.../releases/latest/download/latest.json"]
  }
}
```

Build & publish:

```bash
pnpm build:desktop
pnpm tauri build --bundles appimage deb msi
gh release create v0.0.3 ./bundle/*
```

## Docker (relay-server)

```dockerfile
# packages/relay-server/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Build & run:

```bash
pnpm --filter @ghita/relay-server build
docker build -t ghita-relay packages/relay-server/
docker run -p 3000:3000 -e REDIS_URL=redis://host:6379 ghita-relay
```
