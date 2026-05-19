// ==============================================================================
// GHITA CODING AGENT — Toast Notification Wrapper
// ==============================================================================

import { Toaster } from 'react-hot-toast';

export function Toast() {
  return (
    <Toaster
      position="top-right"
      gutter={8}
      containerStyle={{ top: 20, right: 20 }}
      toastOptions={{
        duration: 3000,
        style: {
          background: 'var(--bg-secondary, #1e1e2e)',
          color: 'var(--text-primary, #e0e0e0)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
          borderRadius: 'var(--radius-md, 8px)',
          padding: '12px 16px',
          fontSize: '14px',
          fontFamily: 'var(--font-sans, system-ui)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          maxWidth: '400px',
        },
        success: {
          iconTheme: {
            primary: '#22c55e',
            secondary: '#1e1e2e',
          },
        },
        error: {
          duration: 5000,
          iconTheme: {
            primary: '#ef4444',
            secondary: '#1e1e2e',
          },
        },
        loading: {
          iconTheme: {
            primary: '#818cf8',
            secondary: '#1e1e2e',
          },
        },
      }}
    />
  );
}
