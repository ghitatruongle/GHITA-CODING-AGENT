# @ghita/skills

![Version](https://img.shields.io/badge/version-0.1.0-blue)

Skill registry and execution engine for GHITA Coding Agent -- builtin skills, plugin system, command routing, and marketplace integration for extensible agent capabilities.

## Key Features

- **Skill registry** -- typed catalog of builtin and user-installed skills with versioning.
- **Plugin system** -- dynamically loadable plugins that extend agent capabilities at runtime.
- **Command routing** -- maps natural-language intents to specific skill handlers.
- **Engineering helpers** -- pre-built skills for code review, testing, linting, and refactoring.
- **Marketplace hooks** -- install and update skills from the GHITA marketplace.

## Installation

```bash
pnpm install --filter @ghita/skills
```

## Usage

```typescript
import { SkillRegistry } from '@ghita/skills';

const registry = new SkillRegistry();
const skill = registry.get('code-review');
const result = await skill.execute({ filePath: './src/index.ts' });
```

## API Docs

Generated via TypeDoc: `pnpm build:docs`
