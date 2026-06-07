/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports, @typescript-eslint/no-non-null-assertion */
// ==============================================================================
// GHITA CODING AGENT — Phase 18: Terminal (xterm.js + WebSocket PTY)
// ==============================================================================
// Enhanced terminal with:
// - xterm.js rendering with FitAddon for auto-resize
// - WebSocket PTY connection via Socket.io to sidecar server
// - Fallback to Tauri shell plugin when PTY unavailable
// - Multiple terminal tabs with independent sessions
// - Shell toggle (cmd.exe / PowerShell)
// ==============================================================================

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useTranslation } from '../i18n';
import { useAppStore } from '../stores/appStore';
import { throttle } from '../utils/throttle';
import { isWindows } from '@ghita/shared';
import '@xterm/xterm/css/xterm.css';

// Dynamic imports for xterm.js (browser-only)
let TerminalImpl: typeof import('@xterm/xterm').Terminal | null = null;
let FitAddonImpl: typeof import('@xterm/addon-fit').FitAddon | null = null;
let xtermLoaded = false;

async function loadXterm() {
  if (xtermLoaded) return;
  try {
    const [xtermMod, fitMod] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);
    TerminalImpl = xtermMod.Terminal;
    FitAddonImpl = fitMod.FitAddon;
    xtermLoaded = true;
  } catch {
    // xterm.js not available, fall back to Tauri shell
    xtermLoaded = true; // prevent re-attempts
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShellType = 'cmd' | 'powershell' | 'bash' | 'sh';

interface ShellConfig {
  name: string;
  cmdName: string;
  args: string[];
  homeCmd: string;
  resolveCmd: (path: string) => string;
  prompt: string;
  color: string;
}

const SHELL_CONFIGS: Record<ShellType, ShellConfig> = {
  cmd: {
    name: 'cmd.exe',
    cmdName: 'cmd',
    args: ['/C'],
    homeCmd: 'echo %USERPROFILE%',
    resolveCmd: (path) => `cd /d "${path}" 2>nul && echo %CD%`,
    prompt: '>',
    color: '#22c55e',
  },
  powershell: {
    name: 'PowerShell',
    cmdName: 'powershell',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command'],
    homeCmd: '$env:USERPROFILE',
    resolveCmd: (path) =>
      `if (Test-Path -Path "${path}" -PathType Container) { (Get-Item "${path}").FullName } else { write-error 'not found' }`,
    prompt: '>',
    color: '#3b82f6',
  },
  bash: {
    name: 'Bash',
    cmdName: 'bash',
    args: ['-c'],
    homeCmd: 'echo $HOME',
    resolveCmd: (path) => `cd "${path}" && pwd`,
    prompt: '$',
    color: '#a78bfa',
  },
  sh: {
    name: 'sh',
    cmdName: 'sh',
    args: ['-c'],
    homeCmd: 'echo $HOME',
    resolveCmd: (path) => `cd "${path}" && pwd`,
    prompt: '$',
    color: '#60a5fa',
  },
};

interface TermLine {
  text: string;
  type: 'stdout' | 'stderr' | 'info' | 'cmd' | 'error';
}

interface TerminalTab {
  id: string;
  label: string;
  shell: ShellType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lineColor(type: TermLine['type']): string {
  switch (type) {
    case 'cmd':
      return '#22c55e';
    case 'stderr':
      return '#ef4444';
    case 'error':
      return '#ef4444';
    case 'info':
      return '#a78bfa';
    case 'stdout':
      return '#e0e0e0';
  }
}

function shortCwd(cwd: string): string {
  if (isWindows()) {
    const parts = cwd.replace(/\//g, '\\').split('\\').filter(Boolean);
    if (parts.length <= 2) return cwd;
    return parts.slice(-2).join('\\');
  } else {
    const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length <= 2) return cwd;
    return parts.slice(-2).join('/');
  }
}

function generateTabId(): string {
  return `term_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// xterm.js Terminal Pane
// ---------------------------------------------------------------------------

function XtermPane({
  shell,
  cwd,
  onCwdChange,
  visible,
}: {
  shell: ShellType;
  cwd: string;
  onCwdChange: (cwd: string) => void;
  visible: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<InstanceType<typeof import('@xterm/xterm').Terminal> | null>(null);
  const fitRef = useRef<InstanceType<typeof import('@xterm/addon-fit').FitAddon> | null>(null);
  const socketRef = useRef<{
    emit: (event: string, ...args: unknown[]) => unknown;
    on: (event: string, cb: (...args: any[]) => void) => unknown;
    off: (event: string, cb: (...args: any[]) => void) => unknown;
    connected: boolean;
  } | null>(null);
  const { t } = useTranslation();
  const [ptyConnected, setPtyConnected] = useState(false);

  // Re-fit xterm when visibility becomes active
  useEffect(() => {
    if (visible && fitRef.current) {
      try {
        setTimeout(() => {
          fitRef.current?.fit();
        }, 50);
      } catch (err) {
        console.error('Fit error:', err);
      }
    }
  }, [visible]);

  // Initialize xterm.js
  useEffect(() => {
    if (!containerRef.current || !TerminalImpl || !FitAddonImpl) return;

    let active = true;
    let registeredSock: any = null;
    let registeredTabId: string | null = null;
    let handleData: ((payload: any) => void) | null = null;
    let handleExit: ((payload: any) => void) | null = null;

    const term = new TerminalImpl({
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

    const fit = new FitAddonImpl();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Write welcome banner
    term.writeln(`\x1b[38;5;141m⚡ GHITA Terminal\x1b[0m — ${SHELL_CONFIGS[shell].name}`);
    term.writeln(`\x1b[38;5;245m${t('terminal.shellSwitchHint')}\x1b[0m`);
    term.writeln('');

    // Attempt WebSocket PTY connection
    import('../utils/sharedSocket')
      .then(({ getSharedSocket }) => {
        getSharedSocket().then((sock) => {
          if (!active) return;
          if (!sock?.connected) {
            term.writeln(`\x1b[38;5;245m${t('terminal.noPty')}\x1b[0m`);
            term.writeln(`\x1b[38;5;245mUsing Tauri shell fallback.\x1b[0m`);
            term.writeln('');
            setupFallbackInput(term, shell, cwd, onCwdChange);
            return;
          }

          socketRef.current = sock as unknown as typeof socketRef.current;
          setPtyConnected(true);

          // Request PTY session
          const tabId = generateTabId();
          registeredSock = sock;
          registeredTabId = tabId;

          sock.emit('terminal_create', {
            id: tabId,
            shellType: shell,
            cols: term.cols,
            rows: term.rows,
            cwd: cwd || undefined,
          });

          // Receive PTY output
          handleData = (payload: any) => {
            if (active && payload?.id === tabId) {
              term.write(payload.data);
            }
          };

          handleExit = (payload: any) => {
            if (active && payload?.id === tabId) {
              term.writeln(
                `\r\n\x1b[38;5;245m[Process exited with code ${payload.exitCode}]\x1b[0m`,
              );
              setPtyConnected(false);
            }
          };

          sock.on('terminal_data', handleData);
          sock.on('terminal_exit', handleExit);

          // Send user input to PTY
          term.onData((data: string) => {
            sock.emit('terminal_data', { id: tabId, data });
          });

          // Handle resize
          term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
            sock.emit('terminal_resize', { id: tabId, cols, rows });
          });

          term.writeln(`\x1b[38;5;82m✓ PTY connected via WebSocket\x1b[0m`);
          term.writeln('');
        });
      })
      .catch(() => {
        if (active) {
          term.writeln(`\x1b[38;5;245m${t('terminal.noPty')}\x1b[0m`);
          setupFallbackInput(term, shell, cwd, onCwdChange);
        }
      });

    // Fit on resize
    const throttledFit = throttle(() => {
      try {
        fit.fit();
      } catch {
        /* ignore during unmount */
      }
    }, 60);

    const resizeObs = new ResizeObserver(() => {
      throttledFit();
    });
    resizeObs.observe(containerRef.current);

    return () => {
      active = false;
      resizeObs.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;

      // Clean up socket shared listeners and process when tab terminal unmounts
      if (registeredSock && registeredTabId) {
        if (handleData) registeredSock.off('terminal_data', handleData);
        if (handleExit) registeredSock.off('terminal_exit', handleExit);
        registeredSock.emit('terminal_close', { id: registeredTabId });
      }
    };
  }, [shell]);

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
      title={ptyConnected ? 'PTY connected' : 'Fallback mode'}
    />
  );
}

// Fallback input handler when no PTY is available
function setupFallbackInput(
  term: InstanceType<typeof import('@xterm/xterm').Terminal>,
  shell: ShellType,
  cwd: string,
  onCwdChange: (cwd: string) => void,
) {
  let inputBuffer = '';
  const config = SHELL_CONFIGS[shell];
  let currentCwd = cwd;

  const writePrompt = () => {
    const prefix = shell === 'powershell' ? `PS ${shortCwd(currentCwd)}` : shortCwd(currentCwd);
    term.write(`\r\n${prefix}${config.prompt} `);
  };

  writePrompt();

  term.onData(async (data: string) => {
    if (data === '\r') {
      // Enter
      const cmd = inputBuffer.trim();
      inputBuffer = '';
      term.write('\r\n');

      if (!cmd) {
        writePrompt();
        return;
      }

      // cd handling
      const cdMatch =
        shell === 'cmd'
          ? cmd.match(/^cd\s*(.*)?$/i)
          : cmd.match(/^(?:cd|Set-Location|sl)(?:\s+(.+))?$/i);

      if (cdMatch) {
        let target = (cdMatch[1] || '').trim().replace(/^"(.*)"$/, '$1');
        if (isWindows()) {
          target = target.replace(/\//g, '\\');
        } else {
          target = target.replace(/\\/g, '/');
        }

        if (!target || target === '~') {
          if (isWindows()) {
            if (shell === 'cmd') {
              term.write(`\r\n${currentCwd}`);
              writePrompt();
              return;
            }
            if (shell === 'powershell') target = currentCwd || 'C:\\Users';
          } else {
            try {
              const { Command } = await import('@tauri-apps/plugin-shell');
              const res = await Command.create(config.cmdName, [...config.args, config.homeCmd]).execute();
              const home = res.stdout.trim();
              target = home || '/';
            } catch {
              target = '/';
            }
          }
        } else if (!isWindows() && target.startsWith('~/')) {
          try {
            const { Command } = await import('@tauri-apps/plugin-shell');
            const res = await Command.create(config.cmdName, [...config.args, config.homeCmd]).execute();
            const home = res.stdout.trim();
            if (home) {
              target = home + target.slice(1);
            }
          } catch {
            // ignore
          }
        }

        if (target) {
          let resolved: string;
          if (isWindows()) {
            resolved = /^[a-zA-Z]:\\/.test(target) ? target : (currentCwd.endsWith('\\') ? currentCwd : currentCwd + '\\') + target;
          } else {
            resolved = target.startsWith('/') ? target : (currentCwd.endsWith('/') ? currentCwd : currentCwd + '/') + target;
          }
          try {
            const { Command } = await import('@tauri-apps/plugin-shell');
            const result = await Command.create(config.cmdName, [
              ...config.args,
              config.resolveCmd(resolved),
            ]).execute();
            if (result.code === 0 && result.stdout.trim().length > 2) {
              currentCwd = result.stdout.trim();
              onCwdChange(currentCwd);
            } else {
              term.write(`\x1b[31mPath not found: ${resolved}\x1b[0m`);
            }
          } catch (e) {
            term.write(`\x1b[31mError: ${e}\x1b[0m`);
          }
        }
        writePrompt();
        return;
      }

      // clear/cls
      if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
        term.clear();
        writePrompt();
        return;
      }

      // Execute command
      try {
        const { Command } = await import('@tauri-apps/plugin-shell');
        const result = await Command.create(config.cmdName, [...config.args, cmd], {
          cwd: currentCwd,
        }).execute();
        if (result.stdout) term.write(result.stdout.replace(/\n/g, '\r\n'));
        if (result.stderr) term.write(`\x1b[31m${result.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
        if (result.code !== 0 && result.code !== null)
          term.write(`\r\n\x1b[31m[Exit code: ${result.code}]\x1b[0m`);
      } catch (e) {
        term.write(`\x1b[31mFailed: ${e}\x1b[0m`);
      }
      writePrompt();
    } else if (data === '\x7f') {
      // Backspace
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1);
        term.write('\b \b');
      }
    } else if (data >= ' ') {
      // Printable
      inputBuffer += data;
      term.write(data);
    }
  });
}

// ---------------------------------------------------------------------------
// Legacy Tauri Shell Terminal (preserved for tests / fallback)
// ---------------------------------------------------------------------------

function LegacyTerminal({ shell }: { shell: ShellType }) {
  const { t } = useTranslation();
  const termRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<TermLine[]>([
    { text: t('terminal.title'), type: 'info' },
    { text: t('terminal.shellSwitchHint'), type: 'info' },
    { text: '', type: 'info' },
  ]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [cwd, setCwd] = useState('');
  const setTerminalCwd = useAppStore((s) => s.setTerminalCwd);
  const terminalCwd = useAppStore((s) => s.terminalCwd);
  const config = SHELL_CONFIGS[shell];
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    setHistory((prev) => [
      ...prev,
      { text: `── Switched to ${SHELL_CONFIGS[shell].name} ──`, type: 'info' },
      { text: '', type: 'info' },
    ]);
  }, [shell]);

  useEffect(() => {
    if (terminalCwd && terminalCwd !== cwd) setCwd(terminalCwd);
  }, [terminalCwd]);

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [history]);

  useEffect(() => {
    (async () => {
      try {
        const { Command } = await import('@tauri-apps/plugin-shell');
        const result = await Command.create(config.cmdName, [
          ...config.args,
          config.homeCmd,
        ]).execute();
        const home = result.stdout.trim();
        if (home && !home.includes('%') && !home.includes('$env:') && home.length > 3) setCwd(home);
      } catch {
        /* non-critical */
      }
    })();
  }, [shell]);

  const MAX_HISTORY = 500;
  const addLines = useCallback((lines: TermLine[]) => {
    setHistory((prev) => {
      const combined = [...prev, ...lines];
      return combined.length > MAX_HISTORY ? combined.slice(-MAX_HISTORY) : combined;
    });
  }, []);

  const executeCommand = useCallback(
    async (rawCmd: string) => {
      const cfg = SHELL_CONFIGS[shell];
      const trimmed = rawCmd.trim();
      if (!trimmed) return;
      addLines([{ text: `${cwd}${cfg.prompt} ${trimmed}`, type: 'cmd' }]);

      // cd
      const cdMatch =
        shell === 'cmd'
          ? trimmed.match(/^cd\s*(.*)?$/i)
          : trimmed.match(/^(?:cd|Set-Location|sl)(?:\s+(.+))?$/i) ||
            trimmed.match(/^\s*([a-zA-Z]:\s*)$/);
      if (cdMatch) {
        let target = (cdMatch[1] || '')
          .trim()
          .replace(/^"(.*)"$/, '$1')
          .replace(/^'(.*)'$/, '$1');

        if (isWindows()) {
          target = target.replace(/\//g, '\\');
        } else {
          target = target.replace(/\\/g, '/');
        }

        if (!target || target === '~') {
          if (isWindows()) {
            if (shell === 'cmd') {
              addLines([{ text: cwd, type: 'stdout' }]);
              return;
            }
            if (shell === 'powershell') target = cwd || 'C:\\Users';
          } else {
            try {
              const { Command } = await import('@tauri-apps/plugin-shell');
              const res = await Command.create(cfg.cmdName, [...cfg.args, cfg.homeCmd]).execute();
              const home = res.stdout.trim();
              target = home || '/';
            } catch {
              target = '/';
            }
          }
        } else if (!isWindows() && target.startsWith('~/')) {
          try {
            const { Command } = await import('@tauri-apps/plugin-shell');
            const res = await Command.create(cfg.cmdName, [...cfg.args, cfg.homeCmd]).execute();
            const home = res.stdout.trim();
            if (home) {
              target = home + target.slice(1);
            }
          } catch {
            // ignore
          }
        }

        if (target) {
          let resolved: string;
          if (isWindows()) {
            if (/^[a-zA-Z]:\\/.test(target) || target.startsWith('\\\\'))
              resolved = target.replace(/^(.):$/, '$1:\\');
            else if (/^[a-zA-Z]:$/.test(target)) resolved = target + '\\';
            else resolved = (cwd.endsWith('\\') ? cwd : cwd + '\\') + target;
            if (shell === 'cmd' && (resolved.startsWith('/d ') || resolved.startsWith('/D ')))
              resolved = resolved.slice(3).trim();
          } else {
            if (target.startsWith('/')) {
              resolved = target;
            } else {
              resolved = (cwd.endsWith('/') ? cwd : cwd + '/') + target;
            }
          }

          try {
            const { Command } = await import('@tauri-apps/plugin-shell');
            const verify = await Command.create(cfg.cmdName, [
              ...cfg.args,
              cfg.resolveCmd(resolved),
            ]).execute();
            const newCwd = verify.stdout.trim();
            if (verify.code === 0 && newCwd && newCwd.length > 2) {
              setCwd(newCwd);
              setTerminalCwd(newCwd);
              addLines([{ text: '', type: 'stdout' }]);
            } else {
              addLines([{ text: t('terminal.pathNotFound', { path: resolved }), type: 'stderr' }]);
            }
          } catch (e) {
            addLines([{ text: `Error: ${String(e)}`, type: 'error' }]);
          }
        }
        return;
      }

      if (trimmed.toLowerCase() === 'clear' || trimmed.toLowerCase() === 'cls') {
        setHistory([]);
        return;
      }

      setIsRunning(true);
      try {
        const { Command } = await import('@tauri-apps/plugin-shell');
        const output = await Command.create(cfg.cmdName, [...cfg.args, trimmed], { cwd }).execute();
        if (output.stdout)
          addLines(
            output.stdout
              .split('\n')
              .filter(Boolean)
              .map((l) => ({ text: l, type: 'stdout' as const })),
          );
        if (output.stderr)
          addLines(
            output.stderr
              .split('\n')
              .filter(Boolean)
              .map((l) => ({ text: l, type: 'stderr' as const })),
          );
        if (output.code !== null && output.code !== 0)
          addLines([{ text: `[Exit code: ${output.code}]`, type: 'error' }]);
      } catch (e) {
        addLines([
          { text: `Failed: ${String(e)}`, type: 'error' },
          { text: t('terminal.permissionHint'), type: 'info' },
        ]);
      } finally {
        setIsRunning(false);
        addLines([{ text: '', type: 'stdout' }]);
      }
    },
    [cwd, shell, addLines],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isRunning) {
      executeCommand(input);
      setInput('');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)',
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        fontSize: '13px',
      }}
    >
      {isRunning && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            gap: '8px',
            background: 'var(--bg-tertiary)',
            userSelect: 'none',
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            ⏳ {t('terminal.running')}
          </span>
        </div>
      )}
      <div
        ref={termRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px 16px',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {history.map((line, i) => (
          <div key={i} style={{ color: lineColor(line.type) }}>
            {line.text}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          borderTop: '1px solid var(--border-subtle)',
          gap: '8px',
        }}
      >
        <span
          style={{ color: config.color, fontWeight: 600, whiteSpace: 'nowrap', fontSize: '12px' }}
        >
          {shell === 'powershell' ? `PS ${shortCwd(cwd)}` : shortCwd(cwd)}
          {config.prompt}
        </span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? t('terminal.running') : t('terminal.placeholder')}
          disabled={isRunning}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: '13px',
            opacity: isRunning ? 0.5 : 1,
          }}
          autoFocus
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Terminal Component (with tabs + xterm.js or fallback)
// ---------------------------------------------------------------------------

function TerminalInner() {
  const { t } = useTranslation();
  const defaultShell: ShellType = isWindows() ? 'powershell' : 'bash';
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: generateTabId(), label: 'Terminal 1', shell: defaultShell },
  ]);
  const [activeTabId, setActiveTabId] = useState(tabs[0]!.id);
  const [useXterm, setUseXterm] = useState(false);
  const [xtermReady, setXtermReady] = useState(false);
  const setTerminalCwd = useAppStore((s) => s.setTerminalCwd);
  const terminalCwd = useAppStore((s) => s.terminalCwd);

  // Try loading xterm.js on mount
  useEffect(() => {
    loadXterm().then(() => {
      setUseXterm(!!TerminalImpl);
      setXtermReady(true);
    });
  }, []);

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
        if (activeTabId === tabId) setActiveTabId(filtered[0]!.id);
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

  const handleCwdChange = useCallback(
    (newCwd: string) => {
      setTerminalCwd(newCwd);
    },
    [setTerminalCwd],
  );

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
        {xtermReady && (
          <span
            style={{
              marginLeft: '8px',
              fontSize: '10px',
              color: useXterm ? '#22c55e' : '#eab308',
              fontWeight: 500,
            }}
            title={useXterm ? 'xterm.js active' : 'Tauri shell fallback'}
          >
            {useXterm ? '⚡ xterm' : '⚙ tauri'}
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
              {useXterm && xtermReady ? (
                <XtermPane
                  shell={tab.shell}
                  cwd={terminalCwd}
                  onCwdChange={handleCwdChange}
                  visible={visible}
                />
              ) : (
                visible && <LegacyTerminal shell={tab.shell} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Terminal = memo(TerminalInner);
