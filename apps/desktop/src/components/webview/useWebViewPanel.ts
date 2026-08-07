// Extracted logic from WebViewPanel (v0.1.5 lint max-lines cleanup)
import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_TAB, normalizeUrl, type BrowserTab, type ProxyStatus } from './urlUtils';

export function useWebViewPanel() {
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

  // deep-review fix (M9): per-tab navigation history. The previous toolbar
  // called `iframe.contentWindow.history.back()` directly, which is a
  // cross-origin access (tauri:// app vs http://127.0.0.1 proxy) and always
  // threw a SecurityError — the back/forward buttons were dead. We track the
  // stack ourselves and re-navigate through the proxy.
  const [historyMap, setHistoryMap] = useState<Record<string, string[]>>({});
  const [historyIndexMap, setHistoryIndexMap] = useState<Record<string, number>>({});

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

      // deep-review fix (M9): record the navigation in the tab's history
      // stack (truncating any forward entries when navigating fresh).
      setHistoryMap((prev) => {
        const stack = prev[activeTabId] ?? [normalizedUrl];
        const idx = historyIndexMap[activeTabId] ?? stack.length - 1;
        const truncated = stack.slice(0, idx + 1);
        if (truncated[truncated.length - 1] === normalizedUrl) return prev;
        return { ...prev, [activeTabId]: [...truncated, normalizedUrl] };
      });
      setHistoryIndexMap((prev) => {
        const stack = historyMap[activeTabId] ?? [normalizedUrl];
        const idx = prev[activeTabId] ?? stack.length - 1;
        const truncated = stack.slice(0, idx + 1);
        if (truncated[truncated.length - 1] === normalizedUrl) return prev;
        return { ...prev, [activeTabId]: truncated.length };
      });

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
    [activeTabId, ensureProxy, historyIndexMap, historyMap],
  );

  // deep-review fix (M9): navigate the active tab through its own history.
  const goBack = useCallback(() => {
    const stack = historyMap[activeTabId] ?? [];
    const idx = historyIndexMap[activeTabId] ?? stack.length - 1;
    if (idx <= 0) return;
    const target = stack[idx - 1];
    if (!target) return;
    setHistoryIndexMap((prev) => ({ ...prev, [activeTabId]: idx - 1 }));
    void navigateTo(target);
  }, [activeTabId, historyMap, historyIndexMap, navigateTo]);

  const goForward = useCallback(() => {
    const stack = historyMap[activeTabId] ?? [];
    const idx = historyIndexMap[activeTabId] ?? stack.length - 1;
    if (idx >= stack.length - 1) return;
    const target = stack[idx + 1];
    if (!target) return;
    setHistoryIndexMap((prev) => ({ ...prev, [activeTabId]: idx + 1 }));
    void navigateTo(target);
  }, [activeTabId, historyMap, historyIndexMap, navigateTo]);

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
    const tabUrl = activeTab?.url;
    if (!tabUrl) return;
    // deep-review fix (L3): reload the tab's own URL from state instead of
    // reading `iframe.src` — the previous code snapshotted the live src and
    // restored it 50ms later, which could clobber a navigation that happened
    // in that window.
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: true } : t)));
    if (iframeRef.current) {
      iframeRef.current.src = '';
      setTimeout(() => {
        if (iframeRef.current) iframeRef.current.src = tabUrl;
      }, 50);
    }
  };

  // Cập nhật address bar khi đổi tab / khi tab điều hướng
  useEffect(() => {
    setAddressInput(activeTab?.displayUrl || '');
  }, [activeTabId, activeTab?.displayUrl]);

  // ─── Render ───────────────────────────────────────────────────────────

  return {
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
    // deep-review fix (M9): history navigation exposed to the toolbar.
    goBack,
    goForward,
  };
}
