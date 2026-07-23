// Extracted from ChatAgentControls
import type { ChatAgentControlsProps } from './chatAgentControlsTypes';

type Props = Pick<
  ChatAgentControlsProps,
  't' | 'contextUsage' | 'ralphMode' | 'showAdvanced' | 'setShowAdvanced'
>;

export function ChatStatusBar(props: Props) {
  const { t, contextUsage, ralphMode, showAdvanced, setShowAdvanced } = props;
  return (
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
  );
}
