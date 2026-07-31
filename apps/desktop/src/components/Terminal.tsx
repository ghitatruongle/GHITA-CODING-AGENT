// ==============================================================================
// GHITA CODING AGENT — Terminal (xterm.js + Rust Native PTY via Tauri IPC)
// ==============================================================================
// Architecture:
//   Frontend (xterm.js) --Tauri IPC (invoke + events)--> Rust PTY --> Shell
//
// Features:
// - xterm.js rendering with FitAddon for auto-resize
// - Native Rust PTY via Tauri invoke commands
// - Multiple terminal tabs with independent sessions
// - Shell toggle (cmd.exe / PowerShell / bash / sh)
// ==============================================================================

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import type { Terminal as TerminalType } from '@xterm/xterm';
import type { FitAddon as FitAddonType } from '@xterm/addon-fit';
import { useTranslation } from '../i18n';
import { useAppStore } from '../stores/appStore';
import { throttle } from '../utils/throttle';
import { isWindows } from '@ghita/shared';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

// ---------------------------------------------------------------------------
// Eager xterm.js loader — resolves at module evaluation so `TerminalImpl`/
// `FitAddonImpl` are available immediately on first render (no Suspense gate).
// ---------------------------------------------------------------------------
let TerminalImpl: typeof TerminalType | null = null;
let FitAddonImpl: typeof FitAddonType | null = null;
let xtermLoadDone = false;

async function loadXterm() {
  if (xtermLoadDone) return;
  try {
    const [mod, fit] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);
    TerminalImpl = mod.Terminal as unknown as typeof TerminalType;
    FitAddonImpl = fit.FitAddon as unknown as typeof FitAddonType;
  } catch {
    // xterm.js unavailable — render a blank pane
  } finally {
    xtermLoadDone = true;
  }
}
void loadXterm();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShellType = 'cmd' | 'powershell' | 'bash' | 'sh';

interface ShellConfig {
  name: string;
  color: string;
}

const SHELL_CONFIGS: Record<ShellType, ShellConfig> = {
  cmd: { name: 'cmd.exe', color: '#22c55e' },
  powershell: { name: 'PowerShell', color: '#3b82f6' },
  bash: { name: 'Bash', color: '#a78bfa' },
  sh: { name: 'sh', color: '#60a5fa' },
};

interface TerminalTab {
  id: string;
  label: string;
  shell: ShellType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateTabId(): string {
  return `term_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// xterm.js Terminal Pane (Rust PTY via Tauri IPC)
// ---------------------------------------------------------------------------

function XtermPane({
  tabId,
  shell,
  cwd,
  visible,
}: {
  tabId: string;
  shell: ShellType;
  cwd: string;
  visible: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<InstanceType<NonNullable<typeof TerminalImpl>> | null>(null);
  const fitRef = useRef<InstanceType<NonNullable<typeof FitAddonImpl>> | null>(null);
  const [ptyConnected, setPtyConnected] = useState(false);

  // Re-fit xterm when visibility becomes active
  useEffect(() => {
    if (visible && fitRef.current) {
      try {
        setTimeout(() => {
          try {
            fitRef.current?.fit();
          } catch {
            /* Ignore fit errors during visibility transition */
          }
        }, 50);
      } catch {
        /* Ignore timeout scheduling errors */
      }
    }
  }, [visible]);

  // Initialize xterm.js and create Rust PTY session
  useEffect(() => {
    if (!containerRef.current || !TerminalImpl || !FitAddonImpl) return;

    let active = true;
    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    const currentTabId = tabId;

    const TerminalCtor = TerminalImpl as any;
    const term = new TerminalCtor({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: {
        background: '#0a0a1a',
        foreground: '#e0e0e0',
        cursor: '#a78bfa',
        selectionBackground: '#a78bfa33',
        black: '#1a1a2e',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a78bfa',
        cyan: '#06b6d4',
        white: '#e0e0e0',
        brightBlack: '#404060',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      convertEol: true,
      scrollback: 5000,
    });

    const FitAddonCtor = FitAddonImpl as any;
    const fit = new FitAddonCtor();
    term.loadAddon(fit);
    term.open(containerRef.current);
    try {
      fit.fit();
    } catch {
      /* Ignore initial fit failure — dimensions may not be ready yet */
    }

    termRef.current = term;
    fitRef.current = fit;

    // Write welcome banner
    term.writeln(`\x1b[38;5;141m⚡ GHITA Terminal\x1b[0m — ${SHELL_CONFIGS[shell].name}`);
    term.writeln('');

    // Create Rust PTY session via Tauri IPC
    (async () => {
      try {
        await invoke('terminal_create', {
          id: currentTabId,
          shellType: shell,
          cols: term.cols,
          rows: term.rows,
          cwd: cwd || undefined,
        });

        if (!active) {
          await invoke('terminal_kill', { id: currentTabId }).catch(() => {});
          return;
        }

        setPtyConnected(true);

        // Listen for PTY output from Rust backend
        unlistenData = await listen<{ id: string; data: string }>('terminal-data', (e) => {
          if (active && e.payload.id === currentTabId) {
            term.write(e.payload.data);
          }
        });

        // Listen for PTY process exit
        unlistenExit = await listen<{ id: string; exitCode: number | null }>(
          'terminal-exit',
          (e) => {
            if (active && e.payload.id === currentTabId) {
              term.writeln(
                `\r\n\x1b[38;5;245m[Process exited with code ${e.payload.exitCode ?? 'unknown'}]\x1b[0m`,
              );
              setPtyConnected(false);
            }
          },
        );

        // Send user input to Rust PTY
        term.onData((data: string) => {
          invoke('terminal_write', { id: currentTabId, data }).catch((e) =>
            console.warn('[terminal] write failed:', e),
          );
        });

        // Handle terminal resize
        term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
          invoke('terminal_resize', { id: currentTabId, cols, rows }).catch((e) =>
            console.warn('[terminal] resize failed:', e),
          );
        });

        term.writeln(`\x1b[38;5;82m✓ PTY connected (native Rust)\x1b[0m`);
        term.writeln('');
      } catch (err) {
        if (active) {
          term.writeln(`\x1b[31mFailed to create PTY: ${err}\x1b[0m`);
        }
      }
    })();

    // Fit on container resize
    const throttledFit = throttle(() => {
      try {
        fit.fit();
      } catch {
        /* ignore fit errors during resize or after dispose */
      }
    }, 60);

    const resizeObs = new ResizeObserver(() => {
      throttledFit();
    });
    resizeObs.observe(containerRef.current);

    return () => {
      // Signal the async PTY setup to stop immediately so it won't write
      // to a disposed terminal or create a session after we kill it.
      active = false;
      resizeObs.disconnect();
      // Kill PTY first to prevent new output arriving after dispose.
      invoke('terminal_kill', { id: currentTabId }).catch(() => {
        /* Silently ignore — terminal may already be gone or Tauri unavailable */
      });
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();
    };
  }, [shell, tabId, cwd]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        padding: '12px',
        boxSizing: 'border-box',
        background: '#0a0a1a',
      }}
      title={ptyConnected ? 'PTY connected (native Rust)' : 'Connecting...'}
    />
  );
}

// ---------------------------------------------------------------------------
// Main Terminal Component (with tabs + xterm.js)
// ---------------------------------------------------------------------------

function TerminalInner() {
  const { t } = useTranslation();
  const defaultShell: ShellType = isWindows() ? 'powershell' : 'bash';
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: generateTabId(), label: 'Terminal 1', shell: defaultShell },
  ]);
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id ?? '');
  const terminalCwd = useAppStore((s) => s.terminalCwd);

  const addTab = useCallback(() => {
    const newTab: TerminalTab = {
      id: generateTabId(),
      label: `Terminal ${tabs.length + 1}`,
      shell: defaultShell,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs.length, defaultShell]);

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        if (filtered.length === 0) return prev; // keep at least one tab
        if (activeTabId === tabId && filtered[0]) setActiveTabId(filtered[0].id);
        return filtered;
      });
    },
    [activeTabId],
  );

  const switchShellInTab = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        let nextShell: ShellType;
        if (isWindows()) {
          nextShell = tab.shell === 'cmd' ? 'powershell' : 'cmd';
        } else {
          nextShell = tab.shell === 'bash' ? 'sh' : 'bash';
        }
        return { ...tab, shell: nextShell };
      }),
    );
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-subtle)',
          gap: '2px',
          minHeight: '32px',
          userSelect: 'none',
          overflowX: 'auto',
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              fontSize: '12px',
              fontFamily: "'JetBrains Mono', 'Consolas', monospace",
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              background: tab.id === activeTabId ? 'var(--bg-primary)' : 'transparent',
              color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-muted)',
              border:
                tab.id === activeTabId ? '1px solid var(--border-subtle)' : '1px solid transparent',
              borderBottom: tab.id === activeTabId ? '1px solid var(--bg-primary)' : 'none',
              marginBottom: '-1px',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: SHELL_CONFIGS[tab.shell].color, fontSize: '10px' }}>●</span>
            <span>{tab.label}</span>
            {tabs.length > 1 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                style={{
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '14px',
                  lineHeight: 1,
                }}
                title="Close tab"
              >
                ×
              </span>
            )}
          </div>
        ))}

        {/* Add tab button */}
        <button
          onClick={addTab}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '2px 8px',
            lineHeight: 1,
          }}
          title={t('terminal.newTab') || 'New terminal tab'}
        >
          +
        </button>

        {/* Shell toggle for active tab */}
        {activeTab && (
          <button
            onClick={() => switchShellInTab(activeTab.id)}
            style={{
              marginLeft: 'auto',
              background: `${SHELL_CONFIGS[activeTab.shell].color}26`,
              border: `1px solid ${SHELL_CONFIGS[activeTab.shell].color}4d`,
              borderRadius: '4px',
              padding: '2px 10px',
              color: SHELL_CONFIGS[activeTab.shell].color,
              fontFamily: "'JetBrains Mono', 'Consolas', monospace",
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {SHELL_CONFIGS[activeTab.shell].name}
          </button>
        )}

        {/* xterm.js indicator */}
        {TerminalImpl && (
          <span
            style={{
              marginLeft: '8px',
              fontSize: '10px',
              color: '#22c55e',
              fontWeight: 500,
            }}
            title="xterm.js + Rust PTY"
          >
            ⚡ xterm
          </span>
        )}
      </div>

      {/* Terminal pane */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: '100%' }}>
        {tabs.map((tab) => {
          const visible = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              style={{
                display: visible ? 'block' : 'none',
                width: '100%',
                height: '100%',
              }}
            >
              {TerminalImpl && (
                <XtermPane tabId={tab.id} shell={tab.shell} cwd={terminalCwd} visible={visible} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Terminal = memo(TerminalInner);
