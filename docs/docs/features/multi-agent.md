---
id: multi-agent
title: Multi-Agent Orchestration
sidebar_label: Multi-Agent
sidebar_position: 5
---

# Multi-Agent Orchestration

GHITA's agent system enables single agents, agent teams, and complex DAG workflows for sophisticated AI-driven task execution.

## ReAct Agent

The **ReAct (Reasoning + Acting)** agent is the core execution primitive:

```typescript
import { createReActAgent } from '@ghita/agents';

const agent = createReActAgent({
  name: 'CodeReviewer',
  model: 'gpt-4o',
  tools: [readFileTool, searchCodeTool, writeFileTool],
  systemPrompt: 'You are a senior code reviewer...',
  maxIterations: 10,
  callbacks: {
    onAction: (action) => console.log('Action:', action.tool),
    onFinish: (result) => console.log('Done:', result.output),
  },
});

const result = await agent.run('Review the auth module for security issues');
```

### Execution Loop

```
1. User sends task
2. Agent reasons about the task (thinking)
3. Agent decides on an action (tool call)
4. Tool executes and returns result
5. Agent incorporates result into reasoning
6. Repeat 3-5 until task is complete or max iterations reached
7. Agent produces final answer
```

## Flow Orchestration

Build complex DAG-based workflows with typed steps:

```typescript
import { Flow, createStep } from '@ghita/agents';

const analyzeStep = createStep('analyze', async (ctx) => {
  // Analyze codebase
  return { files: ['auth.ts', 'db.ts'], issues: 5 };
});

const reviewStep = createStep('review', async (ctx) => {
  const { files } = ctx.previousResult;
  // Review each file
  return { reviewed: files.length, suggestions: 12 };
});

const flow = new Flow({
  name: 'Code Review Pipeline',
  steps: [analyzeStep, reviewStep],
  mode: 'sequential', // or 'parallel'
});

const result = await flow.run({ workspace: '/my-project' });
```

## Agent Groups

Create specialized teams with role-based task assignment:

```typescript
import { AgentManager, AgentGroupManager } from '@ghita/agents';

const manager = new AgentManager(runtime, skills);

// Create agents with specific roles
const coder = await manager.createAgent({
  name: 'Alice',
  role: 'coder',
  description: 'Full-stack developer',
  skills: ['file_write', 'terminal_exec', 'code_test'],
});

const reviewer = await manager.createAgent({
  name: 'Bob',
  role: 'reviewer',
  description: 'Code quality expert',
  skills: ['file_read', 'code_lint', 'git_diff'],
});

// Create a group
const groupManager = new AgentGroupManager(manager, runtime);
const team = groupManager.createGroup({
  name: 'Feature Team',
  description: 'Build and review new features',
  agents: [coder.id, reviewer.id],
});

// Delegate a task to the group
const result = await groupManager.runGroupTask(team.id, 'Implement user authentication');
```

## Debate Engine

Multi-perspective reasoning for robust decisions:

```typescript
import { DebateEngine } from '@ghita/agents';

const debate = new DebateEngine({
  topic: 'Should we migrate from REST to GraphQL?',
  roles: {
    innovator: { model: 'gpt-4o', bias: 'pro-change' },
    devilsAdvocate: { model: 'claude-3.5-sonnet', bias: 'conservative' },
    editorInChief: { model: 'gemini-2.0-flash', bias: 'neutral' },
  },
  maxRounds: 3,
});

const verdict = await debate.run();
// Returns: { decision, reasoning, pros, cons, confidence }
```

## Middleware Pipeline

Add cross-cutting concerns to agent execution:

```typescript
import { MiddlewarePipeline } from '@ghita/agents';

const pipeline = new MiddlewarePipeline({
  middlewares: [
    // Cost tracking
    {
      name: 'cost-tracker',
      pre: async (ctx) => ({ ...ctx, startTime: Date.now() }),
      post: async (ctx, result) => {
        console.log(`Cost: $${result.usage.totalCost}`);
        return result;
      },
    },
    // Human approval for dangerous operations
    {
      name: 'human-approval',
      pre: async (ctx) => {
        if (ctx.tool?.isDangerous) {
          const approved = await requestHumanApproval(ctx.tool);
          if (!approved) throw new Error('Action denied by user');
        }
        return ctx;
      },
    },
    // Security guardrails
    {
      name: 'security-guard',
      pre: async (ctx) => {
        await securityChecker.scan(ctx.messages);
        return ctx;
      },
    },
  ],
});
```

## Task Delegation Pipeline

Break complex tasks into subtasks:

```typescript
import { TaskDelegationPipeline } from '@ghita/agents';

const pipeline = new TaskDelegationPipeline({
  decomposer: 'gpt-4o',   // Model for task decomposition
  executor: 'gpt-4o-mini', // Model for subtask execution
  maxSubtasks: 5,
  parallelExecution: true,
});

const result = await pipeline.run(
  'Refactor the authentication module to use JWT tokens'
);
// Automatically decomposes into:
// 1. Analyze current auth implementation
// 2. Design JWT token flow
// 3. Implement token generation
// 4. Update middleware
// 5. Write tests
```

## Runnable Pipeline

Composable data transformations inspired by LangChain's LCEL:

```typescript
import { runnable, sequence, parallel } from '@ghita/agents';

const pipeline = sequence(
  runnable('parse', (input) => parseUserRequest(input)),
  parallel(
    runnable('search', (parsed) => searchCodebase(parsed)),
    runnable('context', (parsed) => loadContext(parsed)),
  ),
  runnable('generate', ([searchResults, context]) => generateResponse(searchResults, context)),
);

const output = await pipeline.invoke('Fix the login bug');
```
