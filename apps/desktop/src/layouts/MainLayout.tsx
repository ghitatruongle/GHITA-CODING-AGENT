// ==============================================================================
// GHITA CODING AGENT — Main Layout
// ==============================================================================

import { useCallback, useRef, useEffect, Component, lazy, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useAppStore, type TabId } from '../stores/appStore';
import { useTranslation } from '../i18n';
import { isWindows, isLinux } from '@ghita/shared';
import { TabBar } from '../components/TabBar';

const Terminal = lazy(() =>
  import('../components/Terminal').then((module) => ({ default: module.Terminal })),
);
const ChatPanel = lazy(() =>
  import('../components/ChatPanel').then((module) => ({ default: module.ChatPanel })),
);
const CodeView = lazy(() =>
  import('../views/CodeView').then((module) => ({ default: module.CodeView })),
);
const ApiView = lazy(() =>
  import('../views/ApiView').then((module) => ({ default: module.ApiView })),
);
const SkillsView = lazy(() =>
  import('../views/SkillsView').then((module) => ({ default: module.SkillsView })),
);
const AgentsView = lazy(() =>
  import('../views/AgentsView').then((module) => ({ default: module.AgentsView })),
);
const DevicesView = lazy(() =>
  import('../views/DevicesView').then((module) => ({ default: module.DevicesView })),
);
const DashboardView = lazy(() =>
  import('../views/DashboardView').then((module) => ({ default: module.DashboardView })),
);
const SettingsView = lazy(() =>
  import('../views/SettingsView').then((module) => ({ default: module.SettingsView })),
);
const MarketplaceView = lazy(() =>
  import('../views/MarketplaceView').then((module) => ({ default: module.MarketplaceView })),
);
const WorkflowView = lazy(() =>
  import('../views/WorkflowView').then((module) => ({ default: module.WorkflowView })),
);
const EcosystemView = lazy(() =>
  import('../views/EcosystemView').then((module) => ({ default: module.EcosystemView })),
);

function LoadingPanel() {
  return (
    <div
      aria-busy="true"
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
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
  );
}

// --- Per-view Error Boundary ---
function ViewErrorBoundaryInner({
  children,
  t,
  hasError,
  error,
  onReset,
}: {
  children: ReactNode;
  t: (key: string) => string;
  hasError: boolean;
  error: Error | null;
  onReset: () => void;
}) {
  if (hasError && error) {
    return (
      <div style={{ padding: 24, color: 'var(--error)' }}>
        <h3>⚠️ {t('mainLayout.viewError')}</h3>
        <p style={{ fontSize: '13px', opacity: 0.8 }}>{error.message}</p>
        <button
          onClick={onReset}
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
          {t('mainLayout.retry')}
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

class ViewErrorBoundary extends Component<
  { children: ReactNode; t: (key: string) => string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; t: (key: string) => string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ViewErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    return (
      <ViewErrorBoundaryInner
        t={this.props.t}
        hasError={this.state.hasError}
        error={this.state.error}
        onReset={this.handleReset}
      >
        {this.props.children}
      </ViewErrorBoundaryInner>
    );
  }
}

function ActiveView() {
  const activeTab = useAppStore((s) => s.activeTab);
  const { t } = useTranslation();

  // Only render the active tab to eliminate background polling waste.
  // Hidden tabs are unmounted, stopping their intervals and socket connections.
  const TABS: Record<TabId, ReactNode> = {
    code: <CodeView />,
    api: <ApiView />,
    skills: <SkillsView />,
    agents: <AgentsView />,
    devices: <DevicesView />,
    dashboard: <DashboardView />,
    marketplace: <MarketplaceView />,
    workflow: <WorkflowView />,
    ecosystem: <EcosystemView />,
    settings: <SettingsView />,
  };

  return (
    <Suspense fallback={<LoadingPanel />}>
      <div style={{ height: '100%', width: '100%' }}>
        <ViewErrorBoundary t={t}>{TABS[activeTab]}</ViewErrorBoundary>
      </div>
    </Suspense>
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
  const { t } = useTranslation();

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
            {t('app.version')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={toggleTerminal}
            title={t('mainLayout.terminal')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              borderRadius: 'var(--radius-sm)',
              background: isTerminalOpen ? 'var(--bg-active)' : 'transparent',
              color: isTerminalOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
              transition: 'all var(--transition-fast)',
            }}
          >
            💻 {t('mainLayout.terminal')}
          </button>
          <button
            onClick={toggleChat}
            title={t('mainLayout.chat')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              borderRadius: 'var(--radius-sm)',
              background: isChatOpen ? 'var(--bg-active)' : 'transparent',
              color: isChatOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
              transition: 'all var(--transition-fast)',
            }}
          >
            💬 {t('mainLayout.chat')}
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
              <div onMouseDown={onDragStart} className="drag-handle" />
              <div style={{ height: terminalHeight, flexShrink: 0 }}>
                <Suspense fallback={<LoadingPanel />}>
                  <Terminal />
                </Suspense>
              </div>
            </>
          )}
        </div>

        {/* Chat Panel (right sidebar) */}
        {isChatOpen && (
          <div
            style={{
              width: 'min(340px, 40vw)',
              borderLeft: '1px solid var(--border-subtle)',
              flexShrink: 0,
              animation: 'fadeIn 200ms ease forwards',
            }}
          >
            <Suspense fallback={<LoadingPanel />}>
              <ChatPanel />
            </Suspense>
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
          <span>🤖 GHITA {t('app.version')}</span>
          <span>
            {isWindows()
              ? `🖥️ ${t('settings.windows')}`
              : isLinux()
                ? `🖥️ ${t('settings.linux')}`
                : `🖥️ ${t('mainLayout.unknown')}`}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '12px',
            minWidth: 0,
            overflow: 'hidden',
            justifyContent: 'flex-end',
          }}
        >
          <span style={{ color: serverStatus === 'listening' ? 'var(--success)' : undefined }}>
            📡{' '}
            {connectedDevices.length > 0
              ? t('mainLayout.devices', {
                  count: connectedDevices.length,
                  s: connectedDevices.length > 1 ? 's' : '',
                })
              : serverStatus === 'listening'
                ? t('mainLayout.listening')
                : t('mainLayout.noDevices')}
          </span>
          <span>TypeScript</span>
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
