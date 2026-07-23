import { QuickAccessLinks } from './QuickAccessLinks';
import { TabBar } from './webview/TabBar';
import { AddressToolbar } from './webview/AddressToolbar';
import { useWebViewPanel } from './webview/useWebViewPanel';

export function WebViewPanel() {
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    addressInput,
    setAddressInput,
    isEditing,
    setIsEditing,
    proxyPort,
    error,
    setError,
    iframeRef,
    inputRef,
    activeTab,
    navigateTo,
    handleAddressSubmit,
    handleAddressClick,
    addNewTab,
    closeTab,
    switchTab,
    handleIframeLoad,
    handleRefresh,
  } = useWebViewPanel();

  const ACCENT = '#3b82f6';
  const BG_PRIMARY = '#0f0f1a';
  const BORDER = 'rgba(255,255,255,0.07)';
  const TEXT_PRIMARY = '#e2e8f0';
  const TEXT_MUTED = '#64748b';
  void setActiveTabId;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: BG_PRIMARY,
        userSelect: 'none',
      }}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        switchTab={switchTab}
        closeTab={closeTab}
        addNewTab={addNewTab}
      />
      <AddressToolbar
        activeTab={activeTab}
        addressInput={addressInput}
        setAddressInput={setAddressInput}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        proxyPort={proxyPort}
        inputRef={inputRef}
        iframeRef={iframeRef}
        handleAddressSubmit={handleAddressSubmit}
        handleAddressClick={handleAddressClick}
        handleRefresh={handleRefresh}
        navigateTo={navigateTo}
      />

      {/* ── Error banner ── */}
      {error && (
        <div
          style={{
            padding: '6px 14px',
            fontSize: 12,
            background: 'rgba(239,68,68,0.1)',
            borderBottom: '1px solid rgba(239,68,68,0.3)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>⚠️</span> {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Iframe / New Tab page ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Loading bar */}
        {activeTab?.isLoading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              zIndex: 100,
              background: `linear-gradient(90deg, ${ACCENT} 0%, #818cf8 50%, ${ACCENT} 100%)`,
              backgroundSize: '200% 100%',
              animation: 'loading-slide 1.2s ease infinite',
            }}
          />
        )}

        {activeTab?.url ? (
          <iframe
            key={`${activeTab.id}_${activeTab.url}`}
            ref={iframeRef}
            src={activeTab.url}
            style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
            onLoad={handleIframeLoad}
          />
        ) : (
          /* ── New Tab page ── */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 24,
              padding: 32,
              background: `radial-gradient(ellipse at 50% 40%, rgba(59,130,246,0.06) 0%, transparent 70%), ${BG_PRIMARY}`,
            }}
          >
            <div style={{ fontSize: 52 }}>🌐</div>
            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                  textAlign: 'center',
                  marginBottom: 8,
                }}
              >
                Embedded Browser
              </div>
              <div style={{ fontSize: 13, color: TEXT_MUTED, textAlign: 'center', maxWidth: 320 }}>
                Nhập URL hoặc từ khoá vào thanh địa chỉ bên trên để duyệt web
              </div>
            </div>

            {/* Quick access links */}
            <QuickAccessLinks onNavigate={navigateTo} border={BORDER} textPrimary={TEXT_PRIMARY} />
          </div>
        )}
      </div>

      {/* ── CSS animations ── */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes loading-slide {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
    </div>
  );
}
