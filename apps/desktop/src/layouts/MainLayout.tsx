// ==============================================================================
// GHITA CODING AGENT — Main Layout
// ==============================================================================

import { useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { TabBar } from '../components/TabBar';
import { Terminal } from '../components/Terminal';
import { ChatPanel } from '../components/ChatPanel';
import { CodeView } from '../views/CodeView';
import { ApiView } from '../views/ApiView';
import { SkillsView } from '../views/SkillsView';
import { AgentsView } from '../views/AgentsView';
import { DevicesView } from '../views/DevicesView';
import { SettingsView } from '../views/SettingsView';

function ActiveView() {
  const activeTab = useAppStore((s) => s.activeTab);

  switch (activeTab) {
    case 'code':     return <CodeView />;
    case 'api':      return <ApiView />;
    case 'skills':   return <SkillsView />;
    case 'agents':   return <AgentsView />;
    case 'devices':  return <DevicesView />;
    case 'settings': return <SettingsView />;
  }
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
            v0.1.0
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
                style={{
                  height: '4px',
                  background: 'var(--border-subtle)',
                  cursor: 'row-resize',
                  transition: 'background var(--transition-fast)',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--border-subtle)'; }}
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
          <span>🤖 GHITA v0.1.0</span>
          <span>🖥️ Windows</span>
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
