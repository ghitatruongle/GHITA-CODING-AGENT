# @ghita/code-graph

![Version](https://img.shields.io/badge/version-0.1.0-blue)

Code Knowledge Graph -- AST parsing, dependency graph construction, and symbol search for fast, context-aware codebase analysis within the GHITA agent.

## Key Features

- **AST parsing** -- parses source files into abstract syntax trees for structural analysis.
- **Dependency graph** -- builds and persists import/export relationships across the codebase.
- **Symbol search** -- fast lookup of functions, classes, and variables by name or fuzzy match.
- **SQLite-backed storage** -- incremental indexing with persistent graph state.
- **Code-aware context** -- feeds symbol and relationship data to the AI engine for richer responses.

## Installation

```bash
pnpm install --filter @ghita/code-graph
```

## Usage

```typescript
import { CodeGraph } from '@ghita/code-graph';

const graph = new CodeGraph({ dbPath: './code-graph.db' });
await graph.index('./src');
const symbols = graph.search('handleClick');
```

## API Docs

Generated via TypeDoc: `pnpm build:docs`
