// --- Sub-Agent Spawner ---
export { SubagentSpawner } from './spawner.js';

// --- Inter-Agent Communication Channel ---
export { AgentChannel } from './channel.js';

// --- Parent-Child State Sync ---
export { StateSyncManager } from './sync.js';

// --- Types ---
export type {
  SubagentSpawnInput,
  SubagentSpawnResult,
  SubagentState,
  SpawnerConfig,
  ChannelMessage,
  ChannelSubscription,
  StateSnapshot,
  StateDiff,
  SyncConfig,
} from './types.js';
