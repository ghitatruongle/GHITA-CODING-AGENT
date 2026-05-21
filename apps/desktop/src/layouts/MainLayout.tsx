// ==============================================================================
// GHITA CODING AGENT — Main Layout
// ==============================================================================

import { useCallback, useRef, useEffect, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useAppStore } from '../stores/appStore';
import { isWindows, isLinux } from '@ghita/shared';
import { TabBar } from '../components/TabBar';
import { Terminal } from '../components/Terminal';
import { ChatPanel } from '../components/ChatPanel';
import { CodeView } from '../views/CodeView';
import { ApiView } from '../views/ApiView';
import { SkillsView } from '../views/SkillsView';
import { AgentsView } from '../views/AgentsView';
import { DevicesView } from '../views/DevicesView';
import { DashboardView } from '../views/DashboardView';
import { SettingsView } from '../views/SettingsView';
import { MarketplaceView } from '../views/MarketplaceView';
import { WorkflowView } from '../views/WorkflowView';
import { EcosystemView } from '../views/EcosystemView';

// --- Per-view Error Boundary ---
interface ViewErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ViewErrorBoundary extends Component<{ children: ReactNode }, ViewErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ViewErrorBoundary]', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: 24, color: 'var(--error)' }}>
          <h3>⚠️ Lỗi View</h3>
          <p style={{ fontSize: '13px', opacity: 0.8 }}>{this.state.error.message}</p>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: 12,
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid var(--error)',
              background: 'transparent',
              color: 'var(--error)',
              cursor: 'pointer',
            }}
          >
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ActiveView() {
  const activeTab = useAppStore((s) => s.activeTab);

  return (
    <ViewErrorBoundary key={activeTab}>
      {(() => {
        switch (activeTab) {
          case 'code':      return <CodeView />;
          case 'api':       return <ApiView />;
          case 'skills':    return <SkillsView />;
          case 'agents':    return <AgentsView />;
          case 'devices':   return <DevicesView />;
          case 'dashboard': return <DashboardView />;
          case 'marketplace': return <MarketplaceView />;
          case 'workflow':  return <WorkflowView />;
          case 'ecosystem': return <EcosystemView />;
          case 'settings':  return <SettingsView />;
        }
      })()}
    </ViewErrorBoundary>
  );
}

export function MainLayout() {
  const isChatOpen = useAppStore((s) => s.isChatOpen);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const isTerminalOpen = useAppStore((s) => s.isTerminalOpen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const terminalHeight = useAppStore((s) => s.terminalHeight);
  const setTerminalHeight = useAppStore((s) => s.setTerminalHeight);
  const connectedDevices = useAppStore((s) => s.connectedDevices);
  const serverStatus = useAppStore((s) => s.serverStatus);

  // Terminal resize drag
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startY.current = e.clientY;
      startHeight.current = terminalHeight;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [terminalHeight],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - e.clientY;
      setTerminalHeight(startHeight.current + delta);
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [setTerminalHeight]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar — App title + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          height: '40px',
          background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span style={{ fontSize: '18px' }}>🤖</span>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 700,
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.5px',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            GHITA CODING AGENT
          </span>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 8px',
              background: 'var(--accent-primary)',
              color: '#fff',
              borderRadius: 'var(--radius-full)',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            v0.0.2-beta1
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={toggleTerminal}
            title="Toggle Terminal"
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              borderRadius: 'var(--radius-sm)',
              background: isTerminalOpen ? 'var(--bg-active)' : 'transparent',
              color: isTerminalOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
              transition: 'all var(--transition-fast)',
            }}
          >
            💻 Terminal
          </button>
          <button
            onClick={toggleChat}
            title="Toggle Chat"
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              borderRadius: 'var(--radius-sm)',
              background: isChatOpen ? 'var(--bg-active)' : 'transparent',
              color: isChatOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
              transition: 'all var(--transition-fast)',
            }}
          >
            💬 Chat
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <TabBar />

      {/* Main area */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Active view */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} className="view-enter">
            <ActiveView />
          </div>

          {/* Terminal (bottom panel) */}
          {isTerminalOpen && (
            <>
              {/* Drag handle */}
              <div
                onMouseDown={onDragStart}
                className="drag-handle"
              />
              <div style={{ height: terminalHeight, flexShrink: 0 }}>
                <Terminal />
              </div>
            </>
          )}
        </div>

        {/* Chat Panel (right sidebar) */}
        {isChatOpen && (
          <div
            style={{
              width: '340px',
              borderLeft: '1px solid var(--border-subtle)',
              flexShrink: 0,
              animation: 'fadeIn 200ms ease forwards',
            }}
          >
            <ChatPanel />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          height: '24px',
          background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          flexShrink: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', minWidth: 0, overflow: 'hidden' }}>
          <span>🤖 GHITA v0.0.2-beta1</span>
          <span>{isWindows() ? '🖥️ Windows' : isLinux() ? '🖥️ Linux' : '🖥️ Unknown'}</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', minWidth: 0, overflow: 'hidden', justifyContent: 'flex-end' }}>
          <span style={{ color: serverStatus === 'listening' ? 'var(--success)' : undefined }}>
            📡 {connectedDevices.length > 0
              ? `${connectedDevices.length} device${connectedDevices.length > 1 ? 's' : ''}`
              : serverStatus === 'listening' ? 'Listening' : 'No devices'
            }
          </span>
          <span>TypeScript</span>
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
