// Extracted from ChatAgentControls (v0.1.5) — original JSX preserved
import type { Dispatch, SetStateAction } from 'react';
import type { AgentEvent } from '@ghita/shared';

type Props = {
  t: (key: string, params?: Record<string, string | number>) => string;
  agentEvents: AgentEvent[];
  setAgentEvents: Dispatch<SetStateAction<AgentEvent[]>>;
};

export function AgentActivityTimeline(props: Props) {
  const { t, agentEvents, setAgentEvents } = props;
  void t;
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
    </>
  );
}
