// ==============================================================================
// GHITA CODING AGENT — Main Layout
// ==============================================================================

import { useCallback, useRef, useEffect, Component, lazy, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal as TerminalIcon, MessageSquare, Bot, Monitor } from 'lucide-react';
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
  const activeTab = useAppStore((s) => s.activeTab);
  const isChatOpen = useAppStore((s) => s.isChatOpen);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const isTerminalOpen = useAppStore((s) => s.isTerminalOpen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const terminalHeight = useAppStore((s) => s.terminalHeight);
  const setTerminalHeight = useAppStore((s) => s.setTerminalHeight);
  const connectedDevices = useAppStore((s) => s.connectedDevices);
  const serverStatus = useAppStore((s) => s.serverStatus);
  const terminalCwd = useAppStore((s) => s.terminalCwd);
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
    <div className="flex flex-col h-screen overflow-hidden bg-background text-text-primary">
      {/* Top bar — App title + actions */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex items-center justify-between px-4 h-10 bg-bg-tertiary border-b border-border-subtle shrink-0 shadow-sm z-10"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Bot size={18} className="text-accent-primary shrink-0" />
          <span
            style={{
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
            className="text-sm font-bold tracking-wide shrink-0"
          >
            GHITA
          </span>
          {terminalCwd && (
            <>
              <span className="text-text-muted text-[10px] select-none shrink-0">/</span>
              <span className="text-xs text-text-muted font-medium truncate max-w-[180px]" title={terminalCwd}>
                {terminalCwd.split(/[/\\]/).pop()}
              </span>
            </>
          )}
          <span className="text-[9px] px-1.5 py-0.5 bg-bg-active text-accent-primary border border-accent-primary/20 rounded-full font-semibold shrink-0">
            {t('app.version')}
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleTerminal}
            title={t('mainLayout.terminal')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-colors ${
              isTerminalOpen ? 'bg-bg-active text-accent-primary' : 'hover:bg-bg-hover text-text-muted'
            }`}
          >
            <TerminalIcon size={14} /> {t('mainLayout.terminal')}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleChat}
            title={t('mainLayout.chat')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-colors ${
              isChatOpen ? 'bg-bg-active text-accent-primary' : 'hover:bg-bg-hover text-text-muted'
            }`}
          >
            <MessageSquare size={14} /> {t('mainLayout.chat')}
          </motion.button>
        </div>
      </motion.div>

      {/* Tab Bar */}
      <TabBar />

      {/* Main area */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Active view */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0"
              >
                <ActiveView />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Terminal (bottom panel) */}
          <AnimatePresence>
            {isTerminalOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: terminalHeight, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                className="flex flex-col shrink-0 border-t border-border-subtle bg-bg-secondary"
              >
                {/* Drag handle */}
                <div onMouseDown={onDragStart} className="h-1 bg-border-subtle hover:bg-accent-primary cursor-row-resize transition-colors shrink-0" />
                <div className="flex-1 overflow-hidden relative">
                  <Suspense fallback={<LoadingPanel />}>
                    <Terminal />
                  </Suspense>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat Panel (right sidebar) */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0, x: 20 }}
              animate={{ width: 'min(340px, 40vw)', opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: 20 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="border-l border-border-subtle shrink-0 bg-bg-secondary overflow-hidden shadow-lg z-20"
            >
              <Suspense fallback={<LoadingPanel />}>
                <ChatPanel />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status Bar */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
        className="flex items-center justify-between px-4 h-6 bg-bg-tertiary border-t border-border-subtle text-[11px] text-text-muted shrink-0 z-10"
      >
        <div className="flex gap-3 min-w-0 overflow-hidden items-center">
          <Bot size={12} />
          <span>GHITA {t('app.version')}</span>
          <div className="flex items-center gap-1">
            <Monitor size={12} />
            <span>
              {isWindows()
                ? t('settings.windows')
                : isLinux()
                  ? t('settings.linux')
                  : t('mainLayout.unknown')}
            </span>
          </div>
        </div>
        <div className="flex gap-3 min-w-0 overflow-hidden justify-end items-center">
          <span className={serverStatus === 'listening' ? 'text-success flex items-center gap-1' : 'flex items-center gap-1'}>
            <div className={`w-2 h-2 rounded-full ${serverStatus === 'listening' ? 'bg-success animate-pulse' : 'bg-text-muted'}`} />
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
      </motion.div>
    </div>
  );
}
