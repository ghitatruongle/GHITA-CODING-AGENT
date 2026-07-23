// Extracted from WebViewPanel (v0.1.5) — original JSX preserved
import type { MouseEvent } from 'react';
import type { BrowserTab } from './urlUtils';

const ACCENT = '#3b82f6';
const BG_TAB_BAR = '#1a1a2e';
const BG_ACTIVE_TAB = '#1e1e3a';
const BG_INACTIVE_TAB = '#12122a';
const BORDER = 'rgba(255,255,255,0.07)';
const TEXT_PRIMARY = '#e2e8f0';
const TEXT_MUTED = '#64748b';

export function TabBar(props: {
  tabs: BrowserTab[];
  activeTabId: string;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string, e?: MouseEvent) => void;
  addNewTab: () => void;
}) {
  const { tabs, activeTabId, switchTab, closeTab, addNewTab } = props;
  return (
    <>
      {/* ── Tab Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          padding: '6px 8px 0',
          background: BG_TAB_BAR,
          borderBottom: `1px solid ${BORDER}`,
          gap: '2px',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                background: isActive ? BG_ACTIVE_TAB : BG_INACTIVE_TAB,
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                minWidth: '120px',
                maxWidth: '200px',
                border: `1px solid ${isActive ? BORDER : 'transparent'}`,
                borderBottom: isActive ? `1px solid ${BG_ACTIVE_TAB}` : `1px solid ${BORDER}`,
                position: 'relative',
                transition: 'background 0.15s',
                flexShrink: 0,
              }}
            >
              {/* Favicon / loading spinner */}
              <div style={{ width: 14, height: 14, flexShrink: 0 }}>
                {tab.isLoading ? (
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      border: `2px solid ${ACCENT}`,
                      borderTopColor: 'transparent',
                      animation: 'spin 0.7s linear infinite',
                    }}
                  />
                ) : tab.displayUrl ? (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(tab.displayUrl)}&sz=16`}
                    style={{ width: 14, height: 14, borderRadius: 2 }}
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                ) : (
                  <span style={{ fontSize: 10 }}>🌐</span>
                )}
              </div>
              <span
                style={{
                  fontSize: '12px',
                  color: isActive ? TEXT_PRIMARY : TEXT_MUTED,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {tab.title || 'New Tab'}
              </span>
              <button
                onClick={(ev) => closeTab(tab.id, ev)}
                title="Close tab"
                style={{
                  background: 'none',
                  border: 'none',
                  color: TEXT_MUTED,
                  cursor: 'pointer',
                  padding: '1px 3px',
                  borderRadius: 4,
                  fontSize: 11,
                  lineHeight: 1,
                  flexShrink: 0,
                  transition: 'color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = TEXT_MUTED;
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
        <button
          onClick={addNewTab}
          title="New tab"
          style={{
            padding: '4px 10px',
            background: 'transparent',
            border: 'none',
            borderRadius: '6px 6px 0 0',
            color: TEXT_MUTED,
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1.2,
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = TEXT_MUTED;
          }}
        >
          +
        </button>
      </div>
    </>
  );
}
