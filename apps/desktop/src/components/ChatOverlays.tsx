import { useTranslation } from '../i18n';
import type { AgentEvent } from '@ghita/shared';

interface ApprovalModalProps {
  toolName: string;
  toolArguments: string;
  warningMessage?: string;
  onApprove: () => void;
  onReject: (reason?: string) => void;
}

export function ApprovalModal({ toolName, toolArguments, warningMessage, onApprove, onReject }: ApprovalModalProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '300px',
          background: 'rgba(30, 41, 59, 0.7)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          boxShadow: '0 8px 32px rgba(244, 63, 94, 0.2)',
          borderRadius: '16px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#f43f5e', letterSpacing: '1px' }}>
            {t('chat.approveTool')}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>{t('chat.toolName')}</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', fontFamily: 'var(--font-mono)' }}>
            {toolName}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>{t('chat.parameters')}</span>
          <pre
            style={{
              margin: 0,
              padding: '10px',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              fontSize: '11px',
              color: '#cbd5e1',
              maxHeight: '120px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {toolArguments}
          </pre>
        </div>

        {warningMessage && (
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '11px',
              color: '#fda4af',
              lineHeight: '1.5',
            }}
          >
            🚨 **{t('chat.warning')}** {warningMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <button
            onClick={() => onReject()}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(15, 23, 42, 0.4)',
              color: '#94a3b8',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(15, 23, 42, 0.4)')}
          >
            {t('chat.reject')}
          </button>
          <button
            onClick={onApprove}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(244, 63, 94, 0.3)',
              transition: 'transform 0.1s',
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {t('chat.approve')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AgentEventsTimelineProps {
  events: AgentEvent[];
  onClear: () => void;
}

export function AgentEventsTimeline({ events, onClear }: AgentEventsTimelineProps) {
  const { t } = useTranslation();
  return (
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
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulsePurple {
          0% { box-shadow: 0 0 0 0 rgba(192, 132, 252, 0.7); }
          70% { box-shadow: 0 0 0 6px rgba(192, 132, 252, 0); }
          100% { box-shadow: 0 0 0 0 rgba(192, 132, 252, 0); }
        }
        .pulse-indicator-purple {
          animation: pulsePurple 2s infinite;
        }
      `}} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.5px' }}>
          <span className="pulse-indicator-purple" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#c084fc', display: 'inline-block' }} />
          {t('chat.liveAgentEvents')}
        </span>
        <button
          onClick={onClear}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '10px', cursor: 'pointer', opacity: 0.7, transition: 'opacity 0.2s' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
        >
          {t('chat.clear')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '8px' }}>
        {events.map((evt) => {
          let icon = 'ℹ️';
          let color = '#cbd5e1';
          let label: string = evt.type;

          switch (evt.type) {
            case 'agent:thinking': icon = '🧠'; color = '#c084fc'; label = 'Thinking'; break;
            case 'agent:state': icon = '🤖'; color = '#38bdf8'; label = 'State'; break;
            case 'tool:run': icon = '⚙️'; color = '#f472b6'; label = `Running Tool: ${(evt.payload as { name?: string })?.name || ''}`; break;
            case 'tool:complete': icon = '✅'; color = '#34d399'; label = `Completed Tool: ${(evt.payload as { name?: string })?.name || ''}`; break;
            case 'tool:error': icon = '❌'; color = '#f87171'; label = `Tool Error: ${(evt.payload as { name?: string })?.name || ''}`; break;
            case 'skill:learning': icon = '⚡'; color = '#fbbf24'; label = 'Skill Learning'; break;
            case 'memory:update': icon = '💾'; color = '#22d3ee'; label = 'Memory Update'; break;
          }

          return (
            <div
              key={evt.id}
              style={{
                display: 'flex', gap: '10px', fontSize: '12px', color,
                alignItems: 'flex-start', padding: '6px 10px',
                background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.03)',
              }}
            >
              <span style={{ fontSize: '13px' }}>{icon}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontWeight: 600 }}>{evt.message || label}</div>
                {evt.payload != null && typeof evt.payload === 'object' && Object.keys(evt.payload).length > 0 && evt.type !== 'skill:learning' && (
                  <pre style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'rgba(0,0,0,0.15)', padding: '4px 6px', borderRadius: '4px' }}>
                    {JSON.stringify(evt.payload, null, 2)}
                  </pre>
                )}
              </div>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', opacity: 0.6, marginTop: '2px' }}>
                {new Date(evt.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RalphProgressCardProps {
  iteration: number;
  cost: number;
  message: string;
}

export function RalphProgressCard({ iteration, cost, message }: RalphProgressCardProps) {
  const { t } = useTranslation();

  return (
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="pulse-indicator" /> {t('chat.ralphRunning')}
        </span>
        <span style={{ fontSize: '10px', color: '#a7f3d0', background: 'rgba(16, 185, 129, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
          #{iteration} | ${cost.toFixed(5)}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '11px', color: '#cbd5e1' }}>
        {message}
      </p>
    </div>
  );
}
