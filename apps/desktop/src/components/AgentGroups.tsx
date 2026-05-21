// ==============================================================================
// GHITA CODING AGENT - Agent Groups
// ==============================================================================

import { useState } from 'react';
import {
  createDefaultAgentGroupManager,
  createDefaultAgentManager,
  type AgentGroupManager,
  type AgentManager,
  type ManagedAgent,
} from '@ghita/agents';
import { AgentMemory } from '@ghita/memory';
import type { AgentGroup, AgentTask } from '@ghita/shared';

const ROLE_COLORS: Record<string, string> = {
  coder: '#818cf8',
  reviewer: '#c084fc',
  researcher: '#3b82f6',
  planner: '#eab308',
  executor: '#22c55e',
  custom: '#94a3b8',
};

interface AgentRuntimeState {
  manager: AgentManager;
  groups: AgentGroupManager;
}

function createRuntime(): AgentRuntimeState {
  const memory = new AgentMemory([
    {
      id: 'mem_phase5_goal',
      type: 'context',
      content: 'Phase 5 focuses on skills, agents, computer-use, browser-control, and memory.',
      timestamp: Date.now(),
    },
  ]);
  const manager = createDefaultAgentManager(undefined, memory);
  return {
    manager,
    groups: createDefaultAgentGroupManager(manager),
  };
}

// Module-level singleton — persists across component remounts
const globalRuntime = createRuntime();

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'var(--success)';
    case 'working':
    case 'running':
      return 'var(--warning)';
    case 'error':
    case 'failed':
      return 'var(--error)';
    default:
      return 'var(--text-muted)';
  }
}

function AgentRow({ agent }: { agent: ManagedAgent }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 'var(--radius-sm)',
        borderLeft: `3px solid ${ROLE_COLORS[agent.role] ?? 'var(--text-muted)'}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {agent.name}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: ROLE_COLORS[agent.role] ?? 'var(--text-muted)',
            marginTop: '2px',
          }}
        >
          {agent.role} · {agent.skills.length} skills
        </div>
      </div>
      <span
        style={{
          fontSize: '10px',
          padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--bg-hover)',
          color: statusColor(agent.status),
          whiteSpace: 'nowrap',
        }}
      >
        {agent.status}
      </span>
    </div>
  );
}

function LatestTask({ task }: { task?: AgentTask }) {
  if (!task) return null;

  return (
    <div
      style={{
        marginTop: '12px',
        padding: '10px',
        borderRadius: 'var(--radius-sm)',
        background: task.status === 'completed' ? 'var(--success-bg)' : 'var(--error-bg)',
        color: task.status === 'completed' ? 'var(--success)' : 'var(--error)',
        fontSize: '11px',
        lineHeight: 1.5,
      }}
    >
      {task.status === 'completed' ? task.result : task.error}
    </div>
  );
}

export function AgentGroups() {
  const runtime = globalRuntime;
  const [agents, setAgents] = useState<ManagedAgent[]>(() => runtime.manager.list());
  const [groups, setGroups] = useState<AgentGroup[]>(() => runtime.groups.list());
  const [latestTasks, setLatestTasks] = useState<Record<string, AgentTask>>({});
  const [runningGroupId, setRunningGroupId] = useState<string | null>(null);

  const refresh = () => {
    setAgents(runtime.manager.list());
    setGroups(runtime.groups.list());
  };

  const runGroup = async (group: AgentGroup) => {
    setRunningGroupId(group.id);
    const tasks = await runtime.groups.runGroup(group.id);
    const newest = tasks.at(-1);
    if (newest) {
      setLatestTasks((current) => ({ ...current, [group.id]: newest }));
    }
    refresh();
    setRunningGroupId(null);
  };

  return (
    <div style={{ padding: '24px', overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 700,
              marginBottom: '8px',
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Agent Groups
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Agent manager, group assignment, task delegation, and memory-backed context.
          </p>
        </div>
        <div
          style={{
            minWidth: '170px',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
          }}
        >
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent-secondary)' }}>
            {agents.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>registered agents</div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {groups.map((group) => {
          const groupAgents = group.agents
            .map((agentId) => agents.find((agent) => agent.id === agentId))
            .filter((agent): agent is ManagedAgent => Boolean(agent));
          const isRunning = runningGroupId === group.id;

          return (
            <article
              key={group.id}
              style={{
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(99, 102, 241, 0.08))',
                border: '1px solid var(--border-accent)',
                borderRadius: 'var(--radius-md)',
                padding: '18px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-secondary)' }}>
                    {group.name}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                    {group.description}
                  </p>
                </div>
                <span
                  style={{
                    height: '22px',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-hover)',
                    color: statusColor(group.status),
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  {group.status}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
                {groupAgents.map((agent) => (
                  <AgentRow key={agent.id} agent={agent} />
                ))}
              </div>

              <button
                type="button"
                disabled={isRunning}
                onClick={() => {
                  void runGroup(group);
                }}
                style={{
                  marginTop: '14px',
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-active)',
                  color: 'var(--accent-primary)',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {isRunning ? 'Running Group...' : 'Run Group Task'}
              </button>

              <LatestTask task={latestTasks[group.id]} />
            </article>
          );
        })}
      </div>
    </div>
  );
}
