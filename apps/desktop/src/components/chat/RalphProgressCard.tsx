// Extracted from ChatAgentControls
import type { ChatAgentControlsProps } from './chatAgentControlsTypes';

type Props = Pick<ChatAgentControlsProps, 't' | 'ralphProgress'>;

export function RalphProgressCard(props: Props) {
  const { t, ralphProgress } = props;
  return (
    <>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
