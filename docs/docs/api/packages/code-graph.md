---
id: packages-code-graph
title: @ghita/code-graph
sidebar_label: code-graph
---

# @ghita/code-graph

AST parsing, dependency graph, code analysis.

```typescript
import { CodeGraph, Parser } from '@ghita/code-graph';

const graph = new CodeGraph();
const parser = new Parser({ language: 'typescript' });

const ast = await parser.parseFile('src/index.ts');
graph.addNode(ast);
graph.buildEdges();

const deps = graph.dependenciesOf('src/index.ts');
```
