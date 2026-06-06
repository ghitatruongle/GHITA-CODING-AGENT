// ==============================================================================
// GHITA CODING AGENT — App Root
// ==============================================================================

import { useEffect, useRef } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from './components/ErrorFallback';
import { MainLayout } from './layouts/MainLayout';
import { Toast } from './components/Toast';
import { useAppStore } from './stores/appStore';
import { I18nProvider, useTranslation } from './i18n';
import toast from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';

/**
 * Emits a 'ready' event to Tauri after the first React render completes.
 * This ensures the React UI is fully committed to the DOM before the
 * splash window closes and the main window becomes visible.
 */
function ReadyNotifier() {
  useEffect(() => {
    // Use requestAnimationFrame to ensure the first paint has completed
    requestAnimationFrame(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().emit('ready');
      } catch (err) {
        console.warn('[ReadyNotifier] Could not emit ready event (non-Tauri env):', err);
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

  // Sync language changes from desktop React state to the Node sidecar server
  useEffect(() => {
    const syncLanguageToServer = async () => {
      if (language === lastSyncedLangRef.current) return;
      lastSyncedLangRef.current = language;

      try {
        const status = await invoke<{ port: number }>('get_server_status');
        const port = status.port || 8080;
        await fetch(`http://127.0.0.1:${port}/sync-language`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language }),
        });
        if (import.meta.env.DEV) console.info('[AppContent] Language synced to server:', language);
      } catch (err) {
        console.warn('[AppContent] Failed to sync language to server:', err);
      }
    };
    void syncLanguageToServer();
  }, [language]);

  // Auto-start the sidecar server if it is offline on startup
  useEffect(() => {
    const autoStartServer = async () => {
      try {
        const result = await invoke<{ status?: string }>('get_server_status');
        if (result?.status !== 'ok') {
          if (import.meta.env.DEV)
            console.info('[AppContent] Server is offline on startup, invoking start_server...');
          await invoke('start_server');
        } else {
          if (import.meta.env.DEV) console.info('[AppContent] Server is already running.');
        }
      } catch (err) {
        console.warn('[AppContent] Failed to check or start server on startup:', err);
        try {
          await invoke('start_server');
        } catch (startErr) {
          console.error('[AppContent] Failed fallback start_server command:', startErr);
        }
      }
    };
    autoStartServer();
  }, []);

  useEffect(() => {
    let active = true;
    let unlistenFn: (() => void) | undefined;

    const setupListener = async () => {
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
                const lang = data.language;
                if (lang && typeof lang === 'string') {
                  if (import.meta.env.DEV)
                    console.info('[AppContent] Sync language received from sidecar:', lang);
                  lastSyncedLangRef.current = lang;
                  useAppStore.getState().setLanguage(lang);
                }
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
      } catch (err) {
        console.error('[AppContent] Failed to listen to sidecar events:', err);
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

  return (
    <>
      <ReadyNotifier />
      <MainLayout />
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
