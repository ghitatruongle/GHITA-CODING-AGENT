// Extracted from WebViewPanel (v0.1.5) — original JSX preserved
import type { FormEvent, RefObject } from 'react';
import type { BrowserTab } from './urlUtils';

const ACCENT = '#3b82f6';
const BG_TOOLBAR = '#16213e';
const BORDER = 'rgba(255,255,255,0.07)';
const TEXT_PRIMARY = '#e2e8f0';
const TEXT_MUTED = '#64748b';

export function AddressToolbar(props: {
  activeTab?: BrowserTab;
  addressInput: string;
  setAddressInput: (v: string) => void;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  proxyPort: number;
  inputRef: RefObject<HTMLInputElement>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  handleAddressSubmit: (e: FormEvent) => void;
  handleAddressClick: () => void;
  handleRefresh: () => void;
  navigateTo: (url: string) => void;
  
  // instead of the (cross-origin) iframe contentWindow.
  goBack: () => void;
  goForward: () => void;
}) {
  const {
    activeTab,
    addressInput,
    setAddressInput,
    isEditing,
    setIsEditing,
    proxyPort,
    inputRef,
    handleAddressSubmit,
    handleAddressClick,
    handleRefresh,
    goBack,
    goForward,
  } = props;
  void props.navigateTo;
  return (
    <>
      {/* ── Toolbar / Address Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '7px 12px',
          background: BG_TOOLBAR,
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        {/* Navigation buttons — deep-review fix (M9): use the hook-managed
            history stack; direct contentWindow access is cross-origin. */}
        {[
          {
            label: '←',
            title: 'Go back',
            action: goBack,
          },
          {
            label: '→',
            title: 'Go forward',
            action: goForward,
          },
        ].map((btn) => (
          <button
            key={btn.label}
            title={btn.title}
            onClick={btn.action}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              color: TEXT_MUTED,
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = TEXT_PRIMARY;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.color = TEXT_MUTED;
            }}
          >
            {btn.label}
          </button>
        ))}
        <button
          title="Refresh"
          onClick={handleRefresh}
          style={{
            width: 28,
            height: 28,
            padding: 0,
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: TEXT_MUTED,
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
            e.currentTarget.style.color = TEXT_PRIMARY;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.color = TEXT_MUTED;
          }}
        >
          ↻
        </button>

        {/* Address Bar */}
        <form onSubmit={handleAddressSubmit} style={{ flex: 1, display: 'flex' }}>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            {/* Lock icon */}
            {activeTab?.displayUrl?.startsWith('https://') && !isEditing && (
              <span
                style={{
                  position: 'absolute',
                  left: 10,
                  fontSize: 11,
                  color: '#22c55e',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                🔒
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={isEditing ? addressInput : activeTab?.displayUrl || ''}
              onChange={(e) => setAddressInput(e.target.value)}
              onFocus={handleAddressClick}
              onBlur={() => {
                
                setTimeout(() => {
                  setIsEditing(false);
                  setAddressInput(activeTab?.displayUrl || '');
                }, 150);
              }}
              placeholder="Search or enter URL..."
              spellCheck={false}
              style={{
                width: '100%',
                padding:
                  activeTab?.displayUrl?.startsWith('https://') && !isEditing
                    ? '6px 12px 6px 28px'
                    : '6px 12px',
                background: isEditing ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isEditing ? ACCENT : BORDER}`,
                borderRadius: 20,
                color: TEXT_PRIMARY,
                fontSize: '13px',
                // ACCESSIBILITY (audit fix 1.3): removed outline:none
                transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </form>

        {/* Proxy status indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            background: proxyPort > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            borderRadius: 20,
            fontSize: '10px',
            color: proxyPort > 0 ? '#22c55e' : '#ef4444',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            border: `1px solid ${proxyPort > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}
        >
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: proxyPort > 0 ? '#22c55e' : '#ef4444',
              boxShadow: proxyPort > 0 ? '0 0 4px #22c55e' : 'none',
            }}
          />
          {proxyPort > 0 ? `Proxy :${proxyPort}` : 'No proxy'}
        </div>
      </div>
    </>
  );
}
