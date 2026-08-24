import type { Agent, AgentGroup, AgentRole, AgentTask, MemoryEntry } from '@ghita/shared';

export interface SkillRegistry {
  [key: string]: unknown;
}

export type AgentStatus = 'idle' | 'working' | 'completed' | 'error';

export interface ManagedAgent extends Agent {
  status: AgentStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AgentMemoryLike {
  injectContext(query: string, options?: { limit?: number }): string;
  remember(input: {
    type: MemoryEntry['type'];
    content: string;
    metadata?: Record<string, unknown>;
    timestamp?: number;
  }): unknown;
}

export interface AgentRuntimeContext {
  agent: ManagedAgent;
  task: AgentTask;
  skills?: SkillRegistry;
  memory?: AgentMemoryLike;
}

export type AgentRuntime = (context: AgentRuntimeContext) => Promise<string>;

export interface CreateAgentInput {
  name: string;
  role: AgentRole;
  description: string;
  skills?: string[];
  model?: string;
  systemPrompt?: string;
}

export interface CreateGroupInput {
  name: string;
  description: string;
  agents?: string[];
  task?: string;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): number {
  return Date.now();
}

function createTask(agentId: string, description: string, groupId?: string): AgentTask {
  return {
    id: generateId('task'),
    agentId,
    groupId,
    description,
    status: 'pending',
  };
}

const DEFAULT_RUNTIME: AgentRuntime = async ({ agent, task, skills, memory }) => {
  const memoryContext = memory?.injectContext(task.description, { limit: 3 });
  const contextLine = memoryContext ? `\n\nContext:\n${memoryContext}` : '';

  // Try to invoke relevant skills based on agent's skill list
  const results: string[] = [];
  if (skills && agent.skills?.length) {
    for (const skillId of agent.skills) {
      const skill = (skills as Record<string, unknown>)[skillId];
      if (skill && typeof skill === 'object' && 'run' in skill) {
        try {
          const skillResult = await (skill as { run: (input: unknown) => Promise<unknown> }).run({
            task: task.description,
            agent: agent.name,
            role: agent.role,
          });
          results.push(`[${skillId}] ${JSON.stringify(skillResult)}`);
        } catch {
          results.push(`[${skillId}] Skill execution failed`);
        }
      }
    }
  }

  const skillOutput = results.length ? `\n\nSkill Results:\n${results.join('\n')}` : '';
  return `${agent.name} (${agent.role}) completed task "${task.description}".${contextLine}${skillOutput}`;
};

export class AgentManager {
  private readonly agents = new Map<string, ManagedAgent>();
  private readonly tasks = new Map<string, AgentTask>();

  constructor(
    private readonly runtime: AgentRuntime = DEFAULT_RUNTIME,
    private readonly skills?: SkillRegistry,
    private readonly memory?: AgentMemoryLike,
  ) {}

  create(input: CreateAgentInput): ManagedAgent {
    const timestamp = now();
    const agent: ManagedAgent = {
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

  register(agent: Agent): ManagedAgent {
    const timestamp = now();
    const managed: ManagedAgent = {
      ...agent,
      status: 'idle',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.agents.set(managed.id, managed);
    return managed;
  }

  update(id: string, patch: Partial<Omit<ManagedAgent, 'id' | 'createdAt'>>): ManagedAgent {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    const updated = { ...agent, ...patch, updatedAt: now() };
    this.agents.set(id, updated);
    return updated;
  }

  remove(id: string): boolean {
    return this.agents.delete(id);
  }

  get(id: string): ManagedAgent | undefined {
    return this.agents.get(id);
  }

  list(): ManagedAgent[] {
    return [...this.agents.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  listByRole(role: AgentRole): ManagedAgent[] {
    return this.list().filter((agent) => agent.role === role);
  }

  listTasks(agentId?: string): AgentTask[] {
    const tasks = [...this.tasks.values()];
    const filtered = agentId ? tasks.filter((task) => task.agentId === agentId) : tasks;
    return filtered.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));
  }

  async assignTask(agentId: string, description: string, groupId?: string): Promise<AgentTask> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    const task = createTask(agentId, description, groupId);
    this.tasks.set(task.id, task);
    this.update(agentId, { status: 'working' });

    const running: AgentTask = {
      ...task,
      status: 'running',
      startTime: now(),
    };
    this.tasks.set(task.id, running);

    try {
      const result = await this.runtime({
        agent,
        task: running,
        skills: this.skills,
        memory: this.memory,
      });
      const completed: AgentTask = {
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
    } catch (error) {
      const failed: AgentTask = {
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
  private readonly groups = new Map<string, AgentGroup>();

  constructor(private readonly agents: AgentManager) {}

  create(input: CreateGroupInput): AgentGroup {
    const group: AgentGroup = {
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

  register(group: AgentGroup): AgentGroup {
    this.groups.set(group.id, group);
    return group;
  }

  get(id: string): AgentGroup | undefined {
    return this.groups.get(id);
  }

  list(): AgentGroup[] {
    return [...this.groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  addAgent(groupId: string, agentId: string): AgentGroup {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);
    if (!this.agents.get(agentId)) throw new Error(`Agent not found: ${agentId}`);
    if (group.agents.includes(agentId)) return group;

    const updated = { ...group, agents: [...group.agents, agentId] };
    this.groups.set(groupId, updated);
    return updated;
  }

  removeAgent(groupId: string, agentId: string): AgentGroup {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);

    const updated = { ...group, agents: group.agents.filter((id) => id !== agentId) };
    this.groups.set(groupId, updated);
    return updated;
  }

  async runGroup(groupId: string, taskDescription?: string): Promise<AgentTask[]> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);

    const description = taskDescription ?? group.task ?? group.description;
    this.groups.set(groupId, { ...group, status: 'working', task: description });

    const tasks: AgentTask[] = [];
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

export function createDefaultAgentManager(
  skills?: SkillRegistry,
  memory?: AgentMemoryLike,
): AgentManager {
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
    skills: [
      'computer.moveMouse',
      'computer.click',
      'computer.typeText',
      'screenshot.capture',
      'app.open',
    ],
  });
  manager.create({
    name: 'Memory Agent',
    role: 'planner',
    description: 'Stores session context and injects relevant memories into tasks.',
    skills: ['file.read'],
  });

  return manager;
}

export function createDefaultAgentGroupManager(agentManager: AgentManager): AgentGroupManager {
  const groupManager = new AgentGroupManager(agentManager);
  const agents = agentManager.list();
  const byName = new Map(agents.map((agent) => [agent.name, agent.id]));

  groupManager.create({
    name: 'Dev Team',
    description: 'Code implementation, review, and verification.',
    agents: [byName.get('Coder Agent'), byName.get('Reviewer Agent')].filter((id): id is string =>
      Boolean(id),
    ),
    task: 'Implement a scoped code change and verify it.',
  });
  groupManager.create({
    name: 'Automation Team',
    description: 'Browser and desktop automation workflows.',
    agents: [byName.get('Browser Agent'), byName.get('Desktop Agent')].filter((id): id is string =>
      Boolean(id),
    ),
    task: 'Open browser, inspect page data, and execute desktop actions when approved.',
  });
  groupManager.create({
    name: 'Memory Team',
    description: 'Session memory and context planning.',
    agents: [byName.get('Memory Agent')].filter((id): id is string => Boolean(id)),
    task: 'Store session facts and inject relevant context.',
  });

  return groupManager;
}
