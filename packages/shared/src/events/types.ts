// ==============================================================================
// GHITA CODING AGENT - Event Stream Types
// ==============================================================================

export type AgentEventType =
  | 'agent:thinking'
  | 'agent:state'
  | 'tool:run'
  | 'tool:complete'
  | 'tool:error'
  | 'skill:learning'
  | 'memory:update';

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  payload: Record<string, unknown>;
  timestamp: number;
  message?: string;
}
