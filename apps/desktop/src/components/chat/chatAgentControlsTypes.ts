import type React from 'react';
import type { AgentEvent } from '@ghita/shared';
import type { RalphProgress } from './useChatSocket';

// Extracted from ChatAgentControls (v0.1.5)
export interface ChatAgentControlsProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  // Status bar
  contextUsage: { used: number; max: number; percentage: number };
  ralphMode: boolean;
  // Agent events
  agentEvents: AgentEvent[];
  setAgentEvents: React.Dispatch<React.SetStateAction<AgentEvent[]>>;
  // Advanced toggle
  showAdvanced: boolean;
  setShowAdvanced: (v: boolean) => void;
  // Mode controls
  agentRole: 'Explore' | 'Plan' | 'UI' | 'default';
  setAgentRole: (v: 'Explore' | 'Plan' | 'UI' | 'default') => void;
  agentMode: boolean;
  setAgentMode: (v: boolean) => void;
  reviewMode: boolean;
  setReviewMode: (v: boolean) => void;
  featureMode: boolean;
  setFeatureMode: (v: boolean) => void;
  setRalphMode: (v: boolean) => void;
  activeFlowLocal: 'ralph' | 'agent' | null;
  permissionMode: string;
  setPermissionMode: (v: 'custom' | 'auto') => void;
  setActiveFlow: (v: 'ralph' | 'agent' | null) => void;
  // Ralph progress
  ralphProgress: RalphProgress | null;
}
