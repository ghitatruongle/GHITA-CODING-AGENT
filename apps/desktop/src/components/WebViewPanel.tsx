import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { QuickAccessLinks } from './QuickAccessLinks';

interface BrowserTab {
  id: string;
  title: string;
  url: string;
  displayUrl: string; // URL hiển thị trong thanh địa chỉ
  isLoading: boolean;
  faviconUrl: string;
}

interface ProxyStatus {
  running: boolean;
  port: number;
}

const DEFAULT_TAB = (): BrowserTab => ({
  id: `tab_${Date.now()}`,
  title: 'New Tab',
  url: '',
  displayUrl: '',
  isLoading: false,
  faviconUrl: '',
});

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Nếu là search query chứ không phải URL
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    try {
      // Thử parse xem có phải domain không
      const withHttps = `https://${trimmed}`;
      new URL(withHttps);
      // Phải có dấu chấm thì mới là domain
      if (trimmed.includes('.') && !trimmed.includes(' ')) {
        return withHttps;
      }
    } catch {}
    // Không phải URL → search Google
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

export function WebViewPanel() {
  const [tabs, setTabs] = useState<BrowserTab[]>([DEFAULT_TAB()]);
  const [activeTabId, setActiveTabId] = useState(() => {
    const t = DEFAULT_TAB();
    return t.id;
  });
  const [addressInput, setAddressInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [proxyPort, setProxyPort] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const proxyPortRef = useRef(0);

  // Giữ ref đồng bộ
  useEffect(() => {
    proxyPortRef.current = proxyPort;
  }, [proxyPort]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // ─── Khởi tạo và cập nhật proxy port ───────────────────────────────────
  const ensureProxy = useCallback(async (targetUrl: string): Promise<number> => {
    try {
      const status = await invoke<ProxyStatus>('get_proxy_status');
      if (!status.running) {
        const port = await invoke<number>('start_proxy', { targetUrl, port: 0 });
        setProxyPort(port);
        proxyPortRef.current = port;
        return port;
      } else {
        // Cập nhật target URL của proxy đang chạy
        const port = await invoke<number>('start_proxy', { targetUrl, port: status.port });
        setProxyPort(port);
        proxyPortRef.current = port;
        return port;
      }
    } catch (e) {
      setError(`Proxy error: ${e}`);
      return 0;
    }
  }, []);

  useEffect(() => {
    invoke<ProxyStatus>('get_proxy_status')
      .then((s) => {
        if (s.running) {
          setProxyPort(s.port);
          proxyPortRef.current = s.port;
        }
      })
      .catch((err) => console.warn('[WebViewPanel] get_proxy_status failed:', err));
  }, []);

  // ─── Điều hướng ───────────────────────────────────────────────────────
  const navigateTo = useCallback(
    async (rawUrl: string) => {
      const normalizedUrl = normalizeUrl(rawUrl);
      if (!normalizedUrl) return;

      setError(null);
      setIsEditing(false);

      // Cập nhật tab thành loading ngay lập tức
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                displayUrl: normalizedUrl,
                title: new URL(normalizedUrl).hostname || normalizedUrl,
                isLoading: true,
              }
            : t,
        ),
      );

      try {
        const urlObj = new URL(normalizedUrl);
        const domainRoot = `${urlObj.protocol}//${urlObj.host}/`;
        const originalPath = urlObj.pathname + urlObj.search + urlObj.hash;

        const port = await ensureProxy(domainRoot);
        if (port === 0) return;

        const proxyUrl = `http://127.0.0.1:${port}${originalPath}`;

        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId
              ? { ...t, url: proxyUrl, displayUrl: normalizedUrl, isLoading: true }
              : t,
          ),
        );
      } catch (e) {
        setError(`Invalid URL: ${e}`);
        setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: false } : t)));
      }

      setAddressInput(normalizedUrl);
    },
    [activeTabId, ensureProxy],
  );

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(addressInput);
  };

  const handleAddressClick = () => {
    setAddressInput(activeTab?.displayUrl || activeTab?.url || '');
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  };

  // ─── Tabs management ──────────────────────────────────────────────────
  const addNewTab = () => {
    const newTab = DEFAULT_TAB();
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setAddressInput('');
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const closeTab = (tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (tabs.length === 1) {
      const fresh = DEFAULT_TAB();
      setTabs([fresh]);
      setActiveTabId(fresh.id);
      setAddressInput('');
      return;
    }
    const idx = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      const nextTab = newTabs[Math.max(0, idx - 1)];
      if (nextTab) {
        setActiveTabId(nextTab.id);
        setAddressInput(nextTab.displayUrl || '');
      }
    }
  };

  const switchTab = (tabId: string) => {
    setActiveTabId(tabId);
    const tab = tabs.find((t) => t.id === tabId);
    setAddressInput(tab?.displayUrl || '');
    setIsEditing(false);
  };

  // ─── Iframe events ────────────────────────────────────────────────────
  const handleIframeLoad = () => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeTabId) return t;
        let title = t.displayUrl;
        try {
          title = new URL(t.displayUrl).hostname || t.displayUrl;
        } catch {}
        return { ...t, isLoading: false, title };
      }),
    );
  };

  const handleRefresh = () => {
    if (!activeTab?.url) return;
    // Force reload bằng cách set src lại
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: true } : t)));
    if (iframeRef.current) {
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = '';
      setTimeout(() => {
        if (iframeRef.current) iframeRef.current.src = currentSrc;
      }, 50);
    }
  };

  // Cập nhật address bar khi đổi tab
  useEffect(() => {
    setAddressInput(activeTab?.displayUrl || '');
  }, [activeTabId]);

  // ─── Render ───────────────────────────────────────────────────────────
  const ACCENT = '#3b82f6';
  const BG_PRIMARY = '#0f0f1a';
  const BG_TAB_BAR = '#1a1a2e';
  const BG_TOOLBAR = '#16213e';
  const BG_ACTIVE_TAB = '#1e1e3a';
  const BG_INACTIVE_TAB = '#12122a';
  const BORDER = 'rgba(255,255,255,0.07)';
  const TEXT_PRIMARY = '#e2e8f0';
  const TEXT_MUTED = '#64748b';

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
        {/* Navigation buttons */}
        {[
          {
            label: '←',
            title: 'Go back',
            action: () => iframeRef.current?.contentWindow?.history.back(),
          },
          {
            label: '→',
            title: 'Go forward',
            action: () => iframeRef.current?.contentWindow?.history.forward(),
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
                // Khi blur mà không submit thì reset về URL hiện tại
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
