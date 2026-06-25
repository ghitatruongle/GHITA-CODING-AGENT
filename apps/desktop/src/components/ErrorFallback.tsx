// ==============================================================================
// GHITA CODING AGENT — Error Fallback
// ==============================================================================

import { useState } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { useTranslation } from '../i18n';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleCopy = async () => {
    const errorDetails = `
Error: ${error.message}
Stack: ${error.stack || 'No stack trace available'}
    `.trim();

    try {
      await navigator.clipboard.writeText(errorDetails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  const isDev = import.meta.env.DEV;

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
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
          maxWidth: '600px',
          width: '100%',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <h2
          style={{
            fontSize: '22px',
            fontWeight: 700,
            marginBottom: '12px',
            background: 'var(--accent-gradient)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {t('errorFallback.title') || 'Something Went Wrong'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
          An unexpected error occurred in this view.
        </p>

        <div
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid rgba(255,255,255,0.03)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            marginBottom: '20px',
            textAlign: 'left',
          }}
        >
          <pre
            style={{
              color: 'var(--error)',
              fontWeight: 600,
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
              wordBreak: 'break-all',
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {error.message}
          </pre>

          {isDev && error.stack && (
            <div style={{ marginTop: '12px' }}>
              <button
                onClick={() => setShowDetails(!showDetails)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                {showDetails ? 'Hide Stack Trace' : 'Show Stack Trace'}
              </button>

              {showDetails && (
                <pre
                  style={{
                    marginTop: '8px',
                    maxHeight: '150px',
                    overflow: 'auto',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    paddingTop: '8px',
                  }}
                >
                  {error.stack}
                </pre>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={resetErrorBoundary}
            style={{
              padding: '10px 24px',
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
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
            {t('errorFallback.retry') || 'Retry'}
          </button>

          <button
            onClick={handleCopy}
            style={{
              padding: '10px 24px',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
          >
            {copied ? 'Copied!' : 'Copy Details'}
          </button>
        </div>
      </div>
    </div>
  );
}
