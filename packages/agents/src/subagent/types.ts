// ==============================================================================
// GHITA CODING AGENT - Subagent Delegation Types
// ==============================================================================

import type { Agent, AgentRole, AgentTask } from '@ghita/shared';

export interface SubagentSpawnInput {
  name: string;
  role: AgentRole;
  description: string;
  task: string;
  model?: string;
  systemPrompt?: string;
  skills?: string[];
  parentId?: string;
}

export interface SubagentSpawnResult {
  subagentId: string;
  taskId: string;
  status: 'completed' | 'failed';
  result?: string;
  error?: string;
  duration: number;
}

export interface SubagentState {
  id: string;
  parentId?: string;
  agent: Agent;
  task: AgentTask;
  createdAt: number;
  completedAt?: number;
}
