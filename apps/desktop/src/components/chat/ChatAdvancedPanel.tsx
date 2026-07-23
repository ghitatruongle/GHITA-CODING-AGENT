// Extracted from ChatAgentControls
import type { ChatAgentControlsProps } from './chatAgentControlsTypes';

type Props = Pick<
  ChatAgentControlsProps,
  | 't'
  | 'showAdvanced'
  | 'agentRole'
  | 'setAgentRole'
  | 'agentMode'
  | 'setAgentMode'
  | 'reviewMode'
  | 'setReviewMode'
  | 'featureMode'
  | 'setFeatureMode'
  | 'ralphMode'
  | 'setRalphMode'
  | 'activeFlowLocal'
  | 'setActiveFlow'
  | 'permissionMode'
  | 'setPermissionMode'
>;

export function ChatAdvancedPanel(props: Props) {
  const {
    t,
    showAdvanced,
    agentRole,
    setAgentRole,
    agentMode,
    setAgentMode,
    reviewMode,
    setReviewMode,
    featureMode,
    setFeatureMode,
    ralphMode,
    setRalphMode,
    activeFlowLocal,
    setActiveFlow,
    permissionMode,
    setPermissionMode,
  } = props;
  return (
    <>
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
                    border: `1px solid ${
                      agentRole === role ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.05)'
                    }`,
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
                border: `1px solid ${
                  activeFlowLocal === 'ralph'
                    ? '#10b981'
                    : ralphMode
                      ? 'rgba(16, 185, 129, 0.5)'
                      : 'rgba(255, 255, 255, 0.1)'
                }`,
                background:
                  activeFlowLocal === 'ralph'
                    ? 'rgba(16, 185, 129, 0.5)'
                    : ralphMode
                      ? 'rgba(16, 185, 129, 0.2)'
                      : 'rgba(255, 255, 255, 0.03)',
                color: activeFlowLocal === 'ralph' ? '#fff' : ralphMode ? '#34d399' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                boxShadow:
                  activeFlowLocal === 'ralph' ? '0 0 10px rgba(16, 185, 129, 0.5)' : 'none',
              }}
            >
              🔄 Ralph {activeFlowLocal === 'ralph' ? '⏳' : ralphMode ? 'ON' : 'OFF'}
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
                border: `1px solid ${
                  activeFlowLocal === 'agent'
                    ? '#6366f1'
                    : agentMode
                      ? 'rgba(99, 102, 241, 0.5)'
                      : 'rgba(255, 255, 255, 0.1)'
                }`,
                background:
                  activeFlowLocal === 'agent'
                    ? 'rgba(99, 102, 241, 0.5)'
                    : agentMode
                      ? 'rgba(99, 102, 241, 0.2)'
                      : 'rgba(255, 255, 255, 0.03)',
                color: activeFlowLocal === 'agent' ? '#fff' : agentMode ? '#818cf8' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                boxShadow:
                  activeFlowLocal === 'agent' ? '0 0 10px rgba(99, 102, 241, 0.5)' : 'none',
              }}
            >
              🤖 Agent {activeFlowLocal === 'agent' ? '⏳' : agentMode ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setPermissionMode(permissionMode === 'custom' ? 'auto' : 'custom')}
              style={{
                padding: '4px 10px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '4px',
                border: `1px solid ${
                  permissionMode === 'auto' ? 'rgba(251, 191, 36, 0.5)' : 'rgba(59, 130, 246, 0.5)'
                }`,
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
                permissionMode === 'custom' ? t('chat.permissionCustom') : t('chat.permissionAuto')
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
                border: `1px solid ${
                  activeFlowLocal === 'agent' && reviewMode
                    ? '#f59e0b'
                    : reviewMode
                      ? 'rgba(245, 158, 11, 0.5)'
                      : 'rgba(255, 255, 255, 0.1)'
                }`,
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
                border: `1px solid ${
                  activeFlowLocal === 'agent' && featureMode
                    ? '#ec4899'
                    : featureMode
                      ? 'rgba(236, 72, 153, 0.5)'
                      : 'rgba(255, 255, 255, 0.1)'
                }`,
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
    </>
  );
}
