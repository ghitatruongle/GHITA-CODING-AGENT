// ==============================================================================
// GHITA CODING AGENT - Subagent Delegation Types (Phase 6)
// ===============================================================================

import type { Agent, AgentRole, AgentTask } from '@ghita/shared';

// ---------------------------------------------------------------------------
// Spawn Input & Result
// ---------------------------------------------------------------------------

export interface SubagentSpawnInput {
  name: string;
  role: AgentRole;
  description: string;
  task: string;
  model?: string;
  systemPrompt?: string;
  skills?: string[];
  parentId?: string;
  /** Isolated context variables passed to the sub-agent */
  context?: Record<string, unknown>;
  /** Timeout in ms for this sub-agent execution (default: 60_000) */
  timeoutMs?: number;
  /** Tags for grouping / filtering sub-agents */
  tags?: string[];
}

export interface SubagentSpawnResult {
  subagentId: string;
  taskId: string;
  status: 'completed' | 'failed' | 'timeout';
  result?: string;
  error?: string;
  duration: number;
  /** Context snapshot returned from the sub-agent after execution */
  outputContext?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sub-agent State Tracking
// ---------------------------------------------------------------------------

export interface SubagentState {
  id: string;
  parentId?: string;
  agent: Agent;
  task: AgentTask;
  createdAt: number;
  completedAt?: number;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  context: Record<string, unknown>;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Spawner Configuration
// ---------------------------------------------------------------------------

export interface SpawnerConfig {
  /** Maximum concurrent sub-agents (default: 5) */
  maxConcurrency?: number;
  /** Default timeout per sub-agent in ms (default: 60_000) */
  defaultTimeoutMs?: number;
  /** Maximum number of state entries to retain (default: 100) */
  maxStateHistory?: number;
  /** Callback when a sub-agent starts */
  onSpawn?: (state: SubagentState) => void;
  /** Callback when a sub-agent completes */
  onComplete?: (state: SubagentState, result: SubagentSpawnResult) => void;
  /** Callback when a sub-agent fails */
  onError?: (state: SubagentState, error: Error) => void;
}

// ---------------------------------------------------------------------------
// Inter-Agent Communication (Channel)
// ---------------------------------------------------------------------------

export interface ChannelMessage {
  id: string;
  from: string; // sender agent id
  to: string; // recipient agent id or '*' for broadcast
  topic: string;
  payload: unknown;
  timestamp: number;
  replyTo?: string; // id of message being replied to
}

export interface ChannelSubscription {
  id: string;
  agentId: string;
  topic: string;
  handler: (message: ChannelMessage) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Parent-Child State Sync
// ---------------------------------------------------------------------------

export interface StateSnapshot {
  agentId: string;
  timestamp: number;
  data: Record<string, unknown>;
  version: number;
}

export interface StateDiff {
  agentId: string;
  fromVersion: number;
  toVersion: number;
  added: Record<string, unknown>;
  removed: string[];
  changed: Record<string, unknown>;
}

export interface SyncConfig {
  /** Auto-sync interval in ms (0 = disabled, default: 0) */
  autoSyncIntervalMs?: number;
  /** Maximum snapshots to retain per agent (default: 20) */
  maxSnapshotsPerAgent?: number;
  /** Callback invoked when a child state is synced to parent */
  onSync?: (childId: string, diff: StateDiff) => void;
}
