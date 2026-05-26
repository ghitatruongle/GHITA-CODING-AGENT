// ==============================================================================
// GHITA CODING AGENT - Agents Package
// ==============================================================================
// --- Phase 4: Multi-Agent & Pipeline exports ---
// Message System
export { HumanMessage, AIMessage, SystemMessage, ToolMessage, FunctionMessage, messageFromData, } from './messages/message.js';
export { BaseMessage } from './messages/message.js';
// ReAct Agent
export { ReActAgent, createReActAgent } from './react/agent.js';
// Agent Middleware
export { MiddlewarePipeline } from './middleware/pipeline.js';
// Flow Orchestration
export { Flow, createStep } from './flow/flow.js';
// Agent Adapters
export { LangGraphAdapter } from './adapters/langgraph.js';
export { OpenAIAgentsAdapter } from './adapters/openai-agents.js';
// Runnable Pipeline
export { Runnable, LambdaRunnable, runnable, sequence, parallel } from './pipeline/runnable.js';
// Storage Backends
export { InMemoryStorage } from './storage/memory.js';
export { FileSystemStorage } from './storage/filesystem.js';
export { EncoderBackedStorage, JSONEncoder } from './storage/encoder.js';
// Hub Integration
export { HubClient } from './hub/hub.js';
// --- Original exports below ---
export const AGENTS_VERSION = '0.1.0';
function generateId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function now() {
    return Date.now();
}
function createTask(agentId, description, groupId) {
    return {
        id: generateId('task'),
        agentId,
        groupId,
        description,
        status: 'pending',
    };
}
const DEFAULT_RUNTIME = async ({ agent, task, memory }) => {
    const memoryContext = memory?.injectContext(task.description, { limit: 3 });
    const contextLine = memoryContext ? `\n\nContext:\n${memoryContext}` : '';
    return `${agent.name} (${agent.role}) accepted task "${task.description}".${contextLine}`;
};
export class AgentManager {
    runtime;
    skills;
    memory;
    agents = new Map();
    tasks = new Map();
    constructor(runtime = DEFAULT_RUNTIME, skills, memory) {
        this.runtime = runtime;
        this.skills = skills;
        this.memory = memory;
    }
    create(input) {
        const timestamp = now();
        const agent = {
            id: generateId('agent'),
            name: input.name,
            role: input.role,
            description: input.description,
            skills: input.skills ?? [],
            model: input.model,
            systemPrompt: input.systemPrompt,
            status: 'idle',
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        this.agents.set(agent.id, agent);
        return agent;
    }
    register(agent) {
        const timestamp = now();
        const managed = {
            ...agent,
            status: 'idle',
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        this.agents.set(managed.id, managed);
        return managed;
    }
    update(id, patch) {
        const agent = this.agents.get(id);
        if (!agent)
            throw new Error(`Agent not found: ${id}`);
        const updated = { ...agent, ...patch, updatedAt: now() };
        this.agents.set(id, updated);
        return updated;
    }
    remove(id) {
        return this.agents.delete(id);
    }
    get(id) {
        return this.agents.get(id);
    }
    list() {
        return [...this.agents.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    listByRole(role) {
        return this.list().filter((agent) => agent.role === role);
    }
    listTasks(agentId) {
        const tasks = [...this.tasks.values()];
        const filtered = agentId ? tasks.filter((task) => task.agentId === agentId) : tasks;
        return filtered.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));
    }
    async assignTask(agentId, description, groupId) {
        const agent = this.agents.get(agentId);
        if (!agent)
            throw new Error(`Agent not found: ${agentId}`);
        const task = createTask(agentId, description, groupId);
        this.tasks.set(task.id, task);
        this.update(agentId, { status: 'working' });
        const running = {
            ...task,
            status: 'running',
            startTime: now(),
        };
        this.tasks.set(task.id, running);
        try {
            const result = await this.runtime({ agent, task: running, skills: this.skills, memory: this.memory });
            const completed = {
                ...running,
                status: 'completed',
                result,
                endTime: now(),
            };
            this.tasks.set(task.id, completed);
            this.update(agentId, { status: 'completed' });
            this.memory?.remember({
                type: 'context',
                content: `${agent.name} completed: ${description}`,
                metadata: { agentId, taskId: task.id, groupId },
            });
            return completed;
        }
        catch (error) {
            const failed = {
                ...running,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                endTime: now(),
            };
            this.tasks.set(task.id, failed);
            this.update(agentId, { status: 'error' });
            return failed;
        }
    }
}
export class AgentGroupManager {
    agents;
    groups = new Map();
    constructor(agents) {
        this.agents = agents;
    }
    create(input) {
        const group = {
            id: generateId('group'),
            name: input.name,
            description: input.description,
            agents: input.agents ?? [],
            task: input.task,
            status: 'idle',
        };
        this.groups.set(group.id, group);
        return group;
    }
    register(group) {
        this.groups.set(group.id, group);
        return group;
    }
    get(id) {
        return this.groups.get(id);
    }
    list() {
        return [...this.groups.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    addAgent(groupId, agentId) {
        const group = this.groups.get(groupId);
        if (!group)
            throw new Error(`Group not found: ${groupId}`);
        if (!this.agents.get(agentId))
            throw new Error(`Agent not found: ${agentId}`);
        if (group.agents.includes(agentId))
            return group;
        const updated = { ...group, agents: [...group.agents, agentId] };
        this.groups.set(groupId, updated);
        return updated;
    }
    removeAgent(groupId, agentId) {
        const group = this.groups.get(groupId);
        if (!group)
            throw new Error(`Group not found: ${groupId}`);
        const updated = { ...group, agents: group.agents.filter((id) => id !== agentId) };
        this.groups.set(groupId, updated);
        return updated;
    }
    async runGroup(groupId, taskDescription) {
        const group = this.groups.get(groupId);
        if (!group)
            throw new Error(`Group not found: ${groupId}`);
        const description = taskDescription ?? group.task ?? group.description;
        this.groups.set(groupId, { ...group, status: 'working', task: description });
        const tasks = [];
        for (const agentId of group.agents) {
            tasks.push(await this.agents.assignTask(agentId, description, groupId));
        }
        const failed = tasks.some((task) => task.status === 'failed');
        this.groups.set(groupId, {
            ...group,
            task: description,
            status: failed ? 'error' : 'completed',
        });
        return tasks;
    }
}
export function createDefaultAgentManager(skills, memory) {
    const manager = new AgentManager(undefined, skills, memory);
    manager.create({
        name: 'Coder Agent',
        role: 'coder',
        description: 'Implements scoped code changes.',
        skills: ['file.read', 'file.write', 'terminal.run'],
    });
    manager.create({
        name: 'Reviewer Agent',
        role: 'reviewer',
        description: 'Reviews code for correctness, risk, and missing tests.',
        skills: ['file.read', 'terminal.run'],
    });
    manager.create({
        name: 'Browser Agent',
        role: 'executor',
        description: 'Controls browser workflows and extracts page data.',
        skills: ['browser.open', 'browser.navigate', 'browser.extract', 'browser.fill'],
    });
    manager.create({
        name: 'Desktop Agent',
        role: 'executor',
        description: 'Controls desktop mouse, keyboard, screenshots, and apps.',
        skills: ['computer.moveMouse', 'computer.click', 'computer.typeText', 'screenshot.capture', 'app.open'],
    });
    manager.create({
        name: 'Memory Agent',
        role: 'planner',
        description: 'Stores session context and injects relevant memories into tasks.',
        skills: ['file.read'],
    });
    return manager;
}
export function createDefaultAgentGroupManager(agentManager) {
    const groupManager = new AgentGroupManager(agentManager);
    const agents = agentManager.list();
    const byName = new Map(agents.map((agent) => [agent.name, agent.id]));
    groupManager.create({
        name: 'Dev Team',
        description: 'Code implementation, review, and verification.',
        agents: [byName.get('Coder Agent'), byName.get('Reviewer Agent')].filter((id) => Boolean(id)),
        task: 'Implement a scoped code change and verify it.',
    });
    groupManager.create({
        name: 'Automation Team',
        description: 'Browser and desktop automation workflows.',
        agents: [byName.get('Browser Agent'), byName.get('Desktop Agent')].filter((id) => Boolean(id)),
        task: 'Open browser, inspect page data, and execute desktop actions when approved.',
    });
    groupManager.create({
        name: 'Memory Team',
        description: 'Session memory and context planning.',
        agents: [byName.get('Memory Agent')].filter((id) => Boolean(id)),
        task: 'Store session facts and inject relevant context.',
    });
    return groupManager;
}
// --- Phase 4: Subagent Spawner & Cron Scheduler ---
export { SubagentSpawner } from './subagent/spawner.js';
export { CronScheduler } from './scheduler/cron.js';
// --- Phase 6: Debate-Driven Architectural Alignment ---
export { DebateEngine } from './orchestrator/debateEngine.js';
// --- Phase 7A: Agent SDK ---
export { GhitAgentClient } from './sdk/client.js';
// --- Phase 5: Agent Protocol & Router ---
export { AgentProtocolServer } from './protocol/ap.js';
export { AgentRouter } from './router/router.js';
// --- Phase 5: Workflow Engine ---
export { WorkflowAgent } from './workflow/engine.js';
// --- Phase 3: AST-Lock ---
export { ASTLockEngine, ASTLockMiddleware, buildHierarchy, computeSemanticHash, loadASTLockConfig } from './checker/astLock.js';
// --- Phase 8: Git Safe-Points & Safe-Rollback Loop ---
export { GitSafePointManager, GitSafePointMiddleware } from './git/workflow.js';
// --- Phase 11: Source-Controlled Markdown CI Checks Gates ---
export { MarkdownRulesChecker, MarkdownChecksMiddleware } from './checker/markdownRules.js';
//# sourceMappingURL=index.js.map