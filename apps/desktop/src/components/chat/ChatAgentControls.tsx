// ==============================================================================
// GHITA CODING AGENT — Chat Agent Controls Component
// Live agent events timeline, advanced mode toggles, Ralph progress, and
// connection status bar.
// ==============================================================================

import React from 'react';
import type { AgentEvent } from '@ghita/shared';
import type { RalphProgress } from './useChatSocket';

interface ChatAgentControlsProps {
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
      {/* Live Agent Activity Timeline */}
      {agentEvents.length > 0 && (
        <div
          style={{
            margin: '0 16px 12px 16px',
            padding: '12px',
            background: 'rgba(30, 41, 59, 0.45)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            borderRadius: '12px',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '140px',
            overflowY: 'auto',
            animation: 'fadeInUp 0.3s ease',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
          }}
        >
          <style
            dangerouslySetInnerHTML={{
              __html: `
              @keyframes pulsePurple {
                0% { box-shadow: 0 0 0 0 rgba(192, 132, 252, 0.7); }
                70% { box-shadow: 0 0 0 6px rgba(192, 132, 252, 0); }
                100% { box-shadow: 0 0 0 0 rgba(192, 132, 252, 0); }
              }
              .pulse-indicator-purple {
                animation: pulsePurple 2s infinite;
              }
            `,
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--accent-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                letterSpacing: '0.5px',
              }}
            >
              <span
                className="pulse-indicator-purple"
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#c084fc',
                  display: 'inline-block',
                }}
              />
              LIVE AGENT EVENTS
            </span>
            <button
              onClick={() => setAgentEvents([])}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '10px',
                cursor: 'pointer',
                opacity: 0.7,
                transition: 'opacity 0.2s',
              }}
            >
              Clear
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '8px' }}>
            {agentEvents.map((evt) => {
              let icon = 'ℹ️';
              let color = '#cbd5e1';
              let label: string = evt.type;

              switch (evt.type) {
                case 'agent:thinking':
                  icon = '🧠';
                  color = '#c084fc';
                  label = 'Thinking';
                  break;
                case 'agent:state':
                  icon = '🤖';
                  color = '#38bdf8';
                  label = 'State';
                  break;
                case 'tool:run':
                  icon = '⚙️';
                  color = '#f472b6';
                  label = `Running Tool: ${evt.payload?.name || ''}`;
                  break;
                case 'tool:complete':
                  icon = '✅';
                  color = '#34d399';
                  label = `Completed Tool: ${evt.payload?.name || ''}`;
                  break;
                case 'tool:error':
                  icon = '❌';
                  color = '#f87171';
                  label = `Tool Error: ${evt.payload?.name || ''}`;
                  break;
                case 'skill:learning':
                  icon = '⚡';
                  color = '#fbbf24';
                  label = 'Skill Learning';
                  break;
                case 'memory:update':
                  icon = '💾';
                  color = '#22d3ee';
                  label = 'Memory Update';
                  break;
              }

              return (
                <div
                  key={evt.id}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    fontSize: '12px',
                    color,
                    alignItems: 'flex-start',
                    padding: '6px 10px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.03)',
                  }}
                >
                  <span style={{ fontSize: '13px' }}>{icon}</span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontWeight: 600 }}>{evt.message || label}</div>
                    {evt.payload &&
                      typeof evt.payload === 'object' &&
                      Object.keys(evt.payload).length > 0 &&
                      evt.type !== 'skill:learning' && (
                        <pre
                          style={{
                            margin: 0,
                            fontSize: '10px',
                            color: 'var(--text-muted)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            background: 'rgba(0,0,0,0.15)',
                            padding: '4px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {JSON.stringify(evt.payload, null, 2)}
                        </pre>
                      )}
                  </div>
                  <span
                    style={{
                      fontSize: '9px',
                      color: 'var(--text-muted)',
                      opacity: 0.6,
                      marginTop: '2px',
                    }}
                  >
                    {new Date(evt.timestamp).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compact Status & Advanced Toggle Bar */}
      <div
        style={{
          padding: '6px 14px',
          background: 'rgba(30, 41, 59, 0.35)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '10px',
            color: 'rgba(148, 163, 184, 0.6)',
          }}
        >
          <span>
            Context: {contextUsage.used.toLocaleString()} / {contextUsage.max.toLocaleString()}
          </span>
          <div
            style={{
              width: '40px',
              height: '3px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, contextUsage.percentage)}%`,
                background: contextUsage.percentage > 80 ? '#f87171' : '#818cf8',
                borderRadius: '2px',
              }}
            />
          </div>
          {ralphMode && (
            <span style={{ color: '#34d399', fontWeight: 600, fontSize: '10px' }}>🔄 RALPH</span>
          )}
        </div>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            padding: '3px 8px',
            fontSize: '10px',
            fontWeight: 600,
            borderRadius: '4px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            background: showAdvanced ? 'rgba(99, 102, 241, 0.15)' : 'rgba(15, 23, 42, 0.4)',
            color: showAdvanced ? '#a5b4fc' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>{showAdvanced ? '▾' : '▸'}</span>
          <span>{t('chat.advanced')}</span>
        </button>
      </div>

      {/* Advanced Controls Panel (collapsible) */}
      {showAdvanced && (
        <div
          style={{
            padding: '8px 14px',
            background: 'rgba(15, 23, 42, 0.4)',
            borderTop: '1px solid rgba(255, 255, 255, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            animation: 'fadeInUp 0.2s ease',
          }}
        >
          {/* Row 1: Agent Router */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '10px',
                color: '#64748b',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                minWidth: '72px',
              }}
            >
              {t('chat.agentRole')}
            </span>
            <div style={{ display: 'flex', gap: '3px' }}>
              {(['default', 'Explore', 'Plan', 'UI'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => setAgentRole(role)}
                  style={{
                    padding: '3px 7px',
                    fontSize: '10px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border:
                      `1px solid ${ 
                      agentRole === role
                        ? 'rgba(99, 102, 241, 0.4)'
                        : 'rgba(255, 255, 255, 0.05)'}`,
                    background: agentRole === role ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                    color: agentRole === role ? '#a5b4fc' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Ralph Loop + Workflow shortcuts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '10px',
                color: '#64748b',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                minWidth: '72px',
              }}
            >
              {t('chat.workflows')}
            </span>
            <button
              onClick={() => {
                const next = !ralphMode;
                setRalphMode(next);
                if (next) {
                  setAgentMode(false);
                  setReviewMode(false);
                  setFeatureMode(false);
                }
                if (!next) setActiveFlow(null);
              }}
              style={{
                padding: '4px 10px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '4px',
                border:
                  `1px solid ${ 
                  activeFlowLocal === 'ralph'
                    ? '#10b981'
                    : ralphMode
                      ? 'rgba(16, 185, 129, 0.5)'
                      : 'rgba(255, 255, 255, 0.1)'}`,
                background:
                  activeFlowLocal === 'ralph'
                    ? 'rgba(16, 185, 129, 0.5)'
                    : ralphMode
                      ? 'rgba(16, 185, 129, 0.2)'
                      : 'rgba(255, 255, 255, 0.03)',
                color:
                  activeFlowLocal === 'ralph' ? '#fff' : ralphMode ? '#34d399' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                boxShadow:
                  activeFlowLocal === 'ralph' ? '0 0 10px rgba(16, 185, 129, 0.5)' : 'none',
              }}
            >
              🔄 Ralph{' '}
              {activeFlowLocal === 'ralph' ? '⏳' : ralphMode ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => {
                const next = !agentMode;
                setAgentMode(next);
                if (next) {
                  setRalphMode(false);
                  setReviewMode(false);
                  setFeatureMode(false);
                }
                if (!next) setActiveFlow(null);
              }}
              style={{
                padding: '4px 10px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '4px',
                border:
                  `1px solid ${ 
                  activeFlowLocal === 'agent'
                    ? '#6366f1'
                    : agentMode
                      ? 'rgba(99, 102, 241, 0.5)'
                      : 'rgba(255, 255, 255, 0.1)'}`,
                background:
                  activeFlowLocal === 'agent'
                    ? 'rgba(99, 102, 241, 0.5)'
                    : agentMode
                      ? 'rgba(99, 102, 241, 0.2)'
                      : 'rgba(255, 255, 255, 0.03)',
                color:
                  activeFlowLocal === 'agent' ? '#fff' : agentMode ? '#818cf8' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                boxShadow:
                  activeFlowLocal === 'agent' ? '0 0 10px rgba(99, 102, 241, 0.5)' : 'none',
              }}
            >
              🤖 Agent{' '}
              {activeFlowLocal === 'agent' ? '⏳' : agentMode ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() =>
                setPermissionMode(permissionMode === 'custom' ? 'auto' : 'custom')
              }
              style={{
                padding: '4px 10px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '4px',
                border:
                  `1px solid ${ 
                  permissionMode === 'auto'
                    ? 'rgba(251, 191, 36, 0.5)'
                    : 'rgba(59, 130, 246, 0.5)'}`,
                background:
                  permissionMode === 'auto'
                    ? 'rgba(251, 191, 36, 0.15)'
                    : 'rgba(59, 130, 246, 0.15)',
                color: permissionMode === 'auto' ? '#fbbf24' : '#60a5fa',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
              title={
                permissionMode === 'custom'
                  ? t('chat.permissionCustom')
                  : t('chat.permissionAuto')
              }
            >
              {permissionMode === 'custom' ? '🔒 Custom' : '⚡ Auto'}
            </button>
            <button
              onClick={() => {
                const next = !reviewMode;
                setReviewMode(next);
                if (next) {
                  setFeatureMode(false);
                  setAgentMode(false);
                  setRalphMode(false);
                }
                if (!next) setActiveFlow(null);
              }}
              style={{
                padding: '4px 10px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '4px',
                border:
                  `1px solid ${ 
                  activeFlowLocal === 'agent' && reviewMode
                    ? '#f59e0b'
                    : reviewMode
                      ? 'rgba(245, 158, 11, 0.5)'
                      : 'rgba(255, 255, 255, 0.1)'}`,
                background:
                  activeFlowLocal === 'agent' && reviewMode
                    ? 'rgba(245, 158, 11, 0.5)'
                    : reviewMode
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(255, 255, 255, 0.03)',
                color:
                  activeFlowLocal === 'agent' && reviewMode
                    ? '#fff'
                    : reviewMode
                      ? '#fbbf24'
                      : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                boxShadow:
                  activeFlowLocal === 'agent' && reviewMode
                    ? '0 0 10px rgba(245, 158, 11, 0.5)'
                    : 'none',
              }}
            >
              🕵️ Review{' '}
              {activeFlowLocal === 'agent' && reviewMode ? '⏳' : reviewMode ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => {
                const next = !featureMode;
                setFeatureMode(next);
                if (next) {
                  setReviewMode(false);
                  setAgentMode(false);
                  setRalphMode(false);
                }
                if (!next) setActiveFlow(null);
              }}
              style={{
                padding: '4px 10px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '4px',
                border:
                  `1px solid ${ 
                  activeFlowLocal === 'agent' && featureMode
                    ? '#ec4899'
                    : featureMode
                      ? 'rgba(236, 72, 153, 0.5)'
                      : 'rgba(255, 255, 255, 0.1)'}`,
                background:
                  activeFlowLocal === 'agent' && featureMode
                    ? 'rgba(236, 72, 153, 0.5)'
                    : featureMode
                      ? 'rgba(236, 72, 153, 0.2)'
                      : 'rgba(255, 255, 255, 0.03)',
                color:
                  activeFlowLocal === 'agent' && featureMode
                    ? '#fff'
                    : featureMode
                      ? '#f472b6'
                      : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                boxShadow:
                  activeFlowLocal === 'agent' && featureMode
                    ? '0 0 10px rgba(236, 72, 153, 0.5)'
                    : 'none',
              }}
            >
              ⚡ Feature{' '}
              {activeFlowLocal === 'agent' && featureMode ? '⏳' : featureMode ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}

      {/* Ralph Loop Active Dashboard Card */}
      {ralphProgress && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(16, 185, 129, 0.08)',
            borderTop: '1px solid rgba(16, 185, 129, 0.2)',
            borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            animation: 'slideIn 0.2s ease',
          }}
        >
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span className="pulse-indicator" /> {t('chat.ralphRunning')}
            </span>
            <span
              style={{
                fontSize: '10px',
                color: '#a7f3d0',
                background: 'rgba(16, 185, 129, 0.2)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              #{ralphProgress.iteration} | ${ralphProgress.cost.toFixed(5)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '11px', color: '#cbd5e1' }}>{ralphProgress.message}</p>
        </div>
      )}
    </>
  );
}
