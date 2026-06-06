---
id: packages-agents
title: @ghita/agents
sidebar_label: agents
---

# @ghita/agents

Agent orchestrator — planner, executor, skill runner.

## API chính

```typescript
import { Agent, Planner, Executor } from '@ghita/agents';

const agent = new Agent({
  provider: openaiProvider,
  memory: agentMemory,
  skills: [gitCommit, deploySkill],
});

const result = await agent.run('Deploy my app to production');
```

## Classes

- `Agent` — facade chính
- `Planner` — LLM-based planning
- `Executor` — chạy plan steps
- `SkillRegistry` — quản lý skills
- `ToolRegistry` — tools cho function calling
