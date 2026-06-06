// ==============================================================================
// GHITA CODING AGENT — Error Fallback
// ==============================================================================

import type { FallbackProps } from 'react-error-boundary';
import { useTranslation } from '../i18n';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
      <h2
        style={{
          fontSize: '24px',
          marginBottom: '12px',
          background: 'var(--accent-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {t('errorFallback.title')}
      </h2>
      <pre
        style={{
          color: 'var(--error)',
          background: 'var(--error-bg)',
          padding: '16px 24px',
          borderRadius: 'var(--radius-md)',
          maxWidth: '600px',
          overflow: 'auto',
          fontSize: '13px',
          fontFamily: 'var(--font-mono)',
          marginBottom: '20px',
          textAlign: 'left',
        }}
      >
        {error.message}
      </pre>
      <button
        onClick={resetErrorBoundary}
        style={{
          padding: '10px 28px',
          background: 'var(--accent-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'opacity 150ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.85';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
      >
        {t('errorFallback.retry')}
      </button>
    </div>
  );
}
