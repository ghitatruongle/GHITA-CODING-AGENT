# @ghita/skills

![Version](https://img.shields.io/badge/version-0.1.5-blue)
![Coverage](https://img.shields.io/badge/coverage-50%25_lines-yellow)
![Tier](https://img.shields.io/badge/tier-T1_core-orange)

Skill hub, plugin system, marketplace catalog, and integrity guard (`SkillGuard`).

## Install

```bash
pnpm --filter @ghita/skills build
pnpm --filter @ghita/skills test
```

## Core modules

| Module               | Responsibility                          |
| -------------------- | --------------------------------------- |
| `hub/skill-guard`    | SHA-256 content hash + trusted repos    |
| `hub/hub-registry`   | skill registry / install metadata       |
| `registry/md-loader` | load skills from markdown manifests     |
| `plugin-system`      | plugin lifecycle                        |
| `builtin-skills`     | built-in skill definitions              |
| `marketplace/*`      | catalog + install (incubating features) |

## Usage

```ts
import { computeContentHash, computeSkillHash, DEFAULT_TRUSTED_REPOS } from '@ghita/skills';

const hash = computeContentHash('export const x = 1');
const skillHash = computeSkillHash(
  {
    id: 'demo',
    name: 'Demo',
    description: 'd',
    category: 'util',
    version: '1.0.0',
    source: 'local',
    tags: [],
  } as never,
  ['./index.js'],
);

console.log(DEFAULT_TRUSTED_REPOS);
```

## Security notes

- Prefer `computeSkillHash(meta, contentPaths)` — metadata-only hashes warn and can be bypassed (audit 2.17).
- Coverage floor: **≥45% lines** (measured ~50%).

## Test

```bash
pnpm --filter @ghita/skills exec vitest run --coverage
```
