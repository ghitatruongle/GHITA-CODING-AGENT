// ==============================================================================
// GHITA Documentation Site
// ==============================================================================

# GHITA Documentation

Đây là Docusaurus site cho GHITA CODING AGENT (v0.0.3).

## Develop

```bash
pnpm install
pnpm start
```

Site mở ở http://localhost:3000.

## Build

```bash
pnpm build
```

Output ở `build/`.

## Cấu trúc

```
docs/
├── docusaurus.config.ts   # Cấu hình chính
├── sidebars.ts            # Sidebar definitions
├── package.json
├── tsconfig.json
├── docs/                  # Markdown content
│   ├── intro.md
│   ├── getting-started.md
│   ├── architecture.md
│   ├── features/
│   ├── tutorials/
│   └── api/
├── src/
│   ├── css/custom.css     # Theme overrides
│   └── pages/             # Custom React pages (optional)
├── static/                # Static assets (img, favicon)
└── README.md
```

## Thêm page mới

1. Tạo `docs/<section>/<page>.md` với frontmatter:

```markdown
---
id: my-page
title: My Page
sidebar_label: My Page
sidebar_position: 1
---

# My Page

Content...
```

2. Thêm vào `sidebars.ts` nếu cần explicit registration.

## Deploy

Build static files:

```bash
pnpm build
```

Deploy `build/` lên:
- Vercel: `vercel deploy --prebuilt`
- Netlify: drag `build/` vào dashboard
- GitHub Pages: copy `build/` vào `gh-pages` branch
