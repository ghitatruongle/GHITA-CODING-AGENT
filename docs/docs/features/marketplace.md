---
id: marketplace
title: Marketplace
sidebar_label: Marketplace
sidebar_position: 5
---

# Marketplace

Community-driven marketplace cho skills, agents, và prompt templates.

## Browse

```bash
ghita marketplace list --category=skills
ghita marketplace search "github automation"
```

## Install

```bash
ghita marketplace install vercel-deploy
ghita marketplace install anthropic-prompt-engineer
```

## Publish

```bash
cd my-skill/
ghita marketplace init
ghita marketplace publish
```

## Repository format

Mỗi marketplace repo có:

```
my-marketplace/
├── skills/
│   ├── vercel-deploy/
│   │   ├── skill.yaml
│   │   ├── README.md
│   │   └── src/run.ts
│   └── ...
├── agents/
├── prompts/
└── marketplace.yaml
```

Xem `@ghita/marketplace` package source để biết schema đầy đủ.
