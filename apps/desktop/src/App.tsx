// ==============================================================================
// GHITA CODING AGENT — App Root
// ==============================================================================

import { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from './components/ErrorFallback';
import { MainLayout } from './layouts/MainLayout';
import { Toast } from './components/Toast';
import { useAppStore } from './stores/appStore';
import toast from 'react-hot-toast';

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ event: string; data: any }>('sidecar-event', (eventPayload) => {
          const { event, data } = eventPayload.payload;

          switch (event) {
            case 'pair_confirm':
              if (data.resumed) {
                toast.success(`Khôi phục kết nối với thiết bị: ${data.name || 'Mobile'}`);
              } else {
                toast.success(`Đã ghép đôi thành công thiết bị: ${data.name || 'Mobile'}`);
              }
              break;
            case 'command':
              toast(`Đã nhận lệnh từ thiết bị: ${data.action || 'Không rõ'}`, {
                icon: '⚡',
              });
              break;
            case 'chat':
              toast(`Tin nhắn từ di động: "${data.text || ''}"`, {
                icon: '💬',
              });
              break;
            case 'approve':
              toast.success('Thiết bị di động đã ĐỒNG Ý thao tác.', {
                duration: 4000,
              });
              break;
            case 'reject':
              toast.error('Thiết bị di động đã TỪ CHỐI thao tác.', {
                duration: 4000,
              });
              break;
            case 'disconnect':
              toast.error(`Thiết bị ${data.name || 'Mobile'} đã ngắt kết nối.`);
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
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AppContent />
    </ErrorBoundary>
  );
}
