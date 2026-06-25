import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an uncaught error:', error, errorInfo);
  }

  private handleCopy = async () => {
    if (!this.state.error) return;
    const errorDetails = `
Error: ${this.state.error.message}
Stack: ${this.state.error.stack}
Component Stack: ${this.state.errorInfo?.componentStack}
    `.trim();

    try {
      await navigator.clipboard.writeText(errorDetails);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    });
  };

  public render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;

      return (
        <div
          style={{
            padding: '2.5rem',
            color: '#e2e8f0',
            backgroundColor: '#0f0f1a',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              background: '#16213e',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '650px',
              width: '100%',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>⚠️</div>
            <h2
              style={{
                fontSize: '22px',
                fontWeight: 700,
                marginBottom: '8px',
                color: '#ef4444',
              }}
            >
              Application Error
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '1.5rem' }}>
              The application encountered an unexpected runtime error.
            </p>

            <div
              style={{
                textAlign: 'left',
                backgroundColor: '#0f0f1a',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem',
                maxHeight: '200px',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  color: '#f87171',
                  fontWeight: 600,
                  marginBottom: '8px',
                }}
              >
                {this.state.error?.name}: {this.state.error?.message}
              </div>
              {isDev && this.state.error?.stack && (
                <pre
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: '#64748b',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {this.state.error.stack}
                </pre>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '10px 20px',
                  cursor: 'pointer',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Retry Operation
              </button>

              <button
                onClick={this.handleCopy}
                style={{
                  padding: '10px 20px',
                  cursor: 'pointer',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
              >
                {this.state.copied ? 'Copied!' : 'Copy Error Details'}
              </button>

              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 20px',
                  cursor: 'pointer',
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  textDecoration: 'underline',
                }}
              >
                Reload Window
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
