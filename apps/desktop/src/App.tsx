// ==============================================================================
// GHITA CODING AGENT — App Root
// ==============================================================================

import { useEffect, useRef, lazy, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from './components/ErrorFallback';
import { isLocaleCode } from './i18n/types';

const MainLayout = lazy(() =>
  import('./layouts/MainLayout').then((m) => ({ default: m.MainLayout })),
);
import { Toast } from './components/Toast';
import { useAppStore } from './stores/appStore';
import { I18nProvider, useTranslation } from './i18n';
import toast from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';

// Module-level guard to prevent duplicate sidecar server startup in React StrictMode.
// StrictMode double-invokes useEffect in development, which would cause two
// concurrent start_server calls → two Node processes → port conflicts → crash.
let serverStartupInFlight = false;

/** Returns true when running inside the Tauri WebView (not a plain browser). */
function isTauri(): boolean {
  return (
    typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

/**
 * Emits a 'ready' event to Tauri after the first React render completes.
 * This ensures the React UI is fully committed to the DOM before the
 * splash window closes and the main window becomes visible.
 */
function ReadyNotifier() {
  useEffect(() => {
    // Silently skip outside Tauri (e.g. browser-only dev) to avoid console warnings
    if (!isTauri()) return;
    // Use requestAnimationFrame to ensure the first paint has completed
    requestAnimationFrame(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().emit('ready');
      } catch {
        // Silently ignore — emit failure is non-critical (safety timeout will show window)
      }
    });
  }, []);

  return null;
}

function AppContent() {
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const lastSyncedLangRef = useRef(language);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Sync language changes from desktop React state to the Node sidecar server
  useEffect(() => {
    const syncLanguageToServer = async () => {
      if (language === lastSyncedLangRef.current) return;
      if (!isTauri()) return;
      lastSyncedLangRef.current = language;

      try {
        const status = await invoke<{ port: number }>('get_server_status');
        const port = status.port || 39001;
        await fetch(`http://127.0.0.1:${port}/sync-language`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language }),
        });
        if (import.meta.env.DEV) console.info('[AppContent] Language synced to server:', language);
      } catch {
        // Silently ignore — language sync is best-effort
      }
    };
    void syncLanguageToServer();
  }, [language]);

  // Auto-start the sidecar server if it is offline on startup
  useEffect(() => {
    const autoStartServer = async () => {
      // Skip outside Tauri to avoid console errors in browser-only dev
      if (!isTauri()) return;
      // Guard against React StrictMode double-invocation;
      // reset the guard if the server is confirmed stopped so the
      // app can re-trigger start_server after a sidecar update without
      // requiring a full app restart (hot-update support).
      {
        const s = serverStartupInFlight;
        serverStartupInFlight = false;
        if (s) return; // already attempted in this strict-mode flush
      }

      try {
        const result = await invoke<{ status?: string }>('get_server_status');
        if (result?.status !== 'ok') {
          if (import.meta.env.DEV)
            console.info('[AppContent] Server is offline on startup, invoking start_server...');
          await invoke('start_server');
        } else {
          if (import.meta.env.DEV) console.info('[AppContent] Server is already running.');
        }
      } catch {
        // Silently retry once on first failure
        try {
          await invoke('start_server');
        } catch {
          // Sidecar not available — non-critical in dev
        }
      }
    };
    autoStartServer();
  }, []);

  // Listen for server-stop events so the frontend can reconnect after
  // an in-place update kills the sidecar. Clears the startup guard and
  // triggers one reconnection attempt.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      if (!isTauri()) return;
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ event: string }>('tauri://update-status', (e) => {
          if (e.payload.event === 'sidecar-stopped' || e.payload.event === 'update-applied') {
            serverStartupInFlight = false;
            if (import.meta.env.DEV)
              console.info('[AppContent] Sidecar stopped; startup guard reset for reconnect.');
          }
        });
      } catch {
        /* not in Tauri or event not emitted */
      }
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  useEffect(() => {
    let active = true;
    let unlistenFn: (() => void) | undefined;

    const setupListener = async () => {
      // Skip outside Tauri to avoid console errors in browser-only dev
      if (!isTauri()) return;
      try {
        const { listen } = await import('@tauri-apps/api/event');
        if (!active) return;

        const cleanup = await listen<{ event: string; data: Record<string, unknown> }>(
          'sidecar-event',
          (eventPayload) => {
            const { event, data } = eventPayload.payload;

            const tr = tRef.current;
            switch (event) {
              case 'sync_language': {
                // Guard (debug fix): the sidecar contract specifies
                // `data: { language: string }`, but a misbehaving or older
                // sidecar can send `{ event: 'sync_language' }` with no
                // `data` at all. Accessing `data.language` directly would
                // throw a TypeError and tear down the listener.
                const dataObj = (data ?? {}) as { language?: unknown };
                const lang = dataObj.language;
                // Validate the incoming language is a supported LocaleCode.
                // The sidecar may be running on an older install that still
                // sends `es`/`fr`/`pt` which were removed in v0.0.5; those
                // are dropped (review fix: now logged for diagnosability
                // instead of silently swallowed).
                if (typeof lang !== 'string' || !isLocaleCode(lang)) {
                  if (import.meta.env.DEV) {
                    console.warn(
                      '[AppContent] Ignoring sync_language — unsupported or missing locale:',
                      lang,
                    );
                  }
                  break;
                }
                if (import.meta.env.DEV)
                  console.info('[AppContent] Sync language received from sidecar:', lang);
                lastSyncedLangRef.current = lang;
                useAppStore.getState().setLanguage(lang);
                break;
              }
              case 'pair_confirm': {
                const name = String(data.name ?? 'Mobile');
                if (data.resumed) {
                  toast.success(tr('app.deviceReconnected', { name }));
                } else {
                  toast.success(tr('app.devicePaired', { name }));
                }
                break;
              }
              case 'command': {
                const action = String(data.action ?? 'Unknown');
                toast(tr('app.commandReceived', { action }), {
                  icon: '⚡',
                });
                break;
              }
              case 'chat': {
                const text = String(data.text ?? '');
                toast(tr('app.messageFromMobile', { text }), {
                  icon: '💬',
                });
                break;
              }
              case 'approve':
                toast.success(tr('app.deviceApproved'), {
                  duration: 4000,
                });
                break;
              case 'reject':
                toast.error(tr('app.deviceRejected'), {
                  duration: 4000,
                });
                break;
              case 'disconnect': {
                const dname = String(data.name ?? 'Mobile');
                toast.error(tr('app.deviceDisconnected', { name: dname }));
                break;
              }
              default:
                if (import.meta.env.DEV)
                  console.info('[Sidecar IPC] Unhandled event:', event, data);
            }
          },
        );

        if (!active) {
          cleanup();
        } else {
          unlistenFn = cleanup;
        }
      } catch {
        // Tauri event API unavailable — sidecar events are non-critical
      }
    };

    setupListener();

    return () => {
      active = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  const terminalCwd = useAppStore((s) => s.terminalCwd);

  // Sync workspace path to sidecar when it changes
  useEffect(() => {
    let active = true;
    const syncWorkspace = async () => {
      if (!isTauri()) return;
      try {
        const { getSharedSocket } = await import('./utils/sharedSocket');
        const socket = await getSharedSocket();
        if (socket && active) {
          socket.emit('set_workspace', { path: terminalCwd || null });
        }
      } catch (err) {
        console.warn('[AppContent] Failed to sync workspace path to sidecar:', err);
      }
    };
    void syncWorkspace();
    return () => {
      active = false;
    };
  }, [terminalCwd]);

  return (
    <>
      <ReadyNotifier />
      <Suspense
        fallback={
          <div
            style={{
              height: '100vh',
              display: 'grid',
              placeItems: 'center',
              background: '#0f0f1a',
              color: 'var(--text-muted)',
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '2px solid var(--border-subtle)',
                borderTopColor: 'var(--accent-primary)',
                animation: 'spin 700ms linear infinite',
              }}
            />
          </div>
        }
      >
        <MainLayout />
      </Suspense>
      <Toast />
    </>
  );
}

export function App() {
  return (
    <I18nProvider>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <AppContent />
      </ErrorBoundary>
    </I18nProvider>
  );
}
