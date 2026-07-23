# @ghita/agents

![Version](https://img.shields.io/badge/version-0.1.5-blue)
![Coverage](https://img.shields.io/badge/coverage-69%_core_surface-yellow)
![Tier](https://img.shields.io/badge/tier-T0_critical-red)

Orchestration layer: ReAct agents, workflows, middleware pipeline, sub-agent channels, debate engine, and Agent Protocol.

## Install

```bash
pnpm --filter @ghita/agents build
pnpm --filter @ghita/agents test
```

## Core concepts

| Module                              | Responsibility                         |
| ----------------------------------- | -------------------------------------- |
| `ReActAgent`                        | think → act → observe loop with tools  |
| `AdvancedWorkflowEngine`            | DAG steps, retries, timeouts, rollback |
| `MiddlewarePipeline`                | pre/post model & tool hooks            |
| `AgentManager`                      | create/assign/list agents + tasks      |
| `AgentChannel` / `StateSyncManager` | sub-agent messaging & state diffs      |
| `DebateEngine`                      | multi-role debate → consensus spec     |
| `AgentProtocolServer`               | Agent Protocol task/step surface       |

## Usage

```ts
import { ReActAgent, AgentManager, AdvancedWorkflowEngine } from '@ghita/agents';
import { AIMessage } from '@ghita/agents';

const agent = new ReActAgent({
  config: {
    name: 'coder',
    model: 'fake',
    maxIterations: 5,
    tools: [
      {
        name: 'echo',
        description: 'echo',
        parameters: { type: 'object', properties: { text: { type: 'string' } } },
        execute: async (input) => `echo:${input.text}`,
      },
    ],
  },
  llmCall: async () => new AIMessage('done'),
});

const result = await agent.run('hello');
```

## Security notes

- Tool execution errors become observations (no uncaught throw in loop).
- Workflow timeouts clear timers in `finally` (audit 2.3).
- Missing dependencies fail closed (audit 2.2).
- Coverage ship floor: **≥55% lines** on gate scope (excludes adapters/git/markdownRules).

## Test

```bash
pnpm --filter @ghita/agents exec vitest run --coverage
```
