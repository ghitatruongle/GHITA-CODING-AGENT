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
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Auto-start the sidecar server if it is offline on startup
  useEffect(() => {
    const autoStartServer = async () => {
      try {
        const result = await invoke<{ status?: string }>('get_server_status');
        if (result?.status !== 'ok') {
          console.log('[AppContent] Server is offline on startup, invoking start_server...');
          await invoke('start_server');
        } else {
          console.log('[AppContent] Server is already running.');
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
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ event: string; data: any }>('sidecar-event', (eventPayload) => {
          const { event, data } = eventPayload.payload;

          const tr = tRef.current;
          switch (event) {
            case 'pair_confirm':
              if (data.resumed) {
                toast.success(tr('app.deviceReconnected', { name: data.name || 'Mobile' }));
              } else {
                toast.success(tr('app.devicePaired', { name: data.name || 'Mobile' }));
              }
              break;
            case 'command':
              toast(tr('app.commandReceived', { action: data.action || 'Unknown' }), {
                icon: '⚡',
              });
              break;
            case 'chat':
              toast(tr('app.messageFromMobile', { text: data.text || '' }), {
                icon: '💬',
              });
              break;
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
            case 'disconnect':
              toast.error(tr('app.deviceDisconnected', { name: data.name || 'Mobile' }));
              break;
            default:
              console.log('[Sidecar IPC] Unhandled event:', event, data);
          }
        });
      } catch (err) {
        console.error('[AppContent] Failed to listen to sidecar events:', err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
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
