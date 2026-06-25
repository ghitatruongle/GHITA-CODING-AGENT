# @ghita/agents

![Version](https://img.shields.io/badge/version-0.1.0-blue)

Agent manager and orchestration layer for the GHITA Coding Agent. Handles agent lifecycle, grouping, scheduling, and inter-agent communication.

## Key Features

- **Agent lifecycle management** -- create, start, pause, and terminate agents programmatically.
- **Agent grouping & hierarchy** -- organize agents into teams with role-based permissions.
- **Workflow orchestration** -- pipeline-based execution with support for sequential and parallel steps.
- **Subagent spawning** -- dynamic subagent creation with scoped context and resource limits.
- **Git-aware scheduling** -- integrates with repository state to queue agent runs on branch events.

## Installation

```bash
pnpm install --filter @ghita/agents
```

## Usage

```typescript
import { AgentManager, AgentRole } from '@ghita/agents';

const manager = new AgentManager();
const agent = await manager.create({ role: AgentRole.Coder, name: 'dev-1' });
await agent.start();
```

## API Docs

Generated via TypeDoc: `pnpm build:docs`
