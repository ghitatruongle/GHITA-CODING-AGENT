import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#ff4444', backgroundColor: '#fff', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>
          <h2>Application Error</h2>
          <p>The application encountered an unexpected runtime error.</p>
          <pre style={{ backgroundColor: '#ffeeee', padding: '1rem', borderRadius: '4px', maxWidth: '80vw', overflowX: 'auto' }}>
            {this.state.error?.message}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer', backgroundColor: '#ff4444', color: '#fff', border: 'none', borderRadius: '4px' }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
