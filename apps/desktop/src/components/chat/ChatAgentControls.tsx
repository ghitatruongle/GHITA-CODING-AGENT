// ==============================================================================
// GHITA CODING AGENT — Chat Agent Controls Component
// Live agent events timeline, advanced mode toggles, Ralph progress, and
// connection status bar.
// ==============================================================================

import type { ChatAgentControlsProps } from './chatAgentControlsTypes';
import { AgentActivityTimeline } from './AgentActivityTimeline';
import { ChatStatusBar } from './ChatStatusBar';
import { ChatAdvancedPanel } from './ChatAdvancedPanel';
import { RalphProgressCard } from './RalphProgressCard';

export function ChatAgentControls({
  t,
  contextUsage,
  ralphMode,
  agentEvents,
  setAgentEvents,
  showAdvanced,
  setShowAdvanced,
  agentRole,
  setAgentRole,
  agentMode,
  setAgentMode,
  reviewMode,
  setReviewMode,
  featureMode,
  setFeatureMode,
  setRalphMode,
  activeFlowLocal,
  permissionMode,
  setPermissionMode,
  setActiveFlow,
  ralphProgress,
}: ChatAgentControlsProps) {
  return (
    <>
      <AgentActivityTimeline t={t} agentEvents={agentEvents} setAgentEvents={setAgentEvents} />
      <ChatStatusBar
        t={t}
        contextUsage={contextUsage}
        ralphMode={ralphMode}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
      />
      <ChatAdvancedPanel
        t={t}
        showAdvanced={showAdvanced}
        agentRole={agentRole}
        setAgentRole={setAgentRole}
        agentMode={agentMode}
        setAgentMode={setAgentMode}
        reviewMode={reviewMode}
        setReviewMode={setReviewMode}
        featureMode={featureMode}
        setFeatureMode={setFeatureMode}
        ralphMode={ralphMode}
        setRalphMode={setRalphMode}
        activeFlowLocal={activeFlowLocal}
        setActiveFlow={setActiveFlow}
        permissionMode={permissionMode}
        setPermissionMode={setPermissionMode}
      />
      <RalphProgressCard t={t} ralphProgress={ralphProgress} />
    </>
  );
}
