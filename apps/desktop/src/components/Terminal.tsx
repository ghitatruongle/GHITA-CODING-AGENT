// ==============================================================================
// GHITA CODING AGENT — Terminal (Tauri Shell Plugin)
// Supports both cmd.exe and PowerShell with a toggle switch
// ==============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { Command } from '@tauri-apps/plugin-shell';
import { useTranslation } from '../i18n';
import { useAppStore } from '../stores/appStore';

type ShellType = 'cmd' | 'powershell';

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
    args: ['-NoProfile', '-Command'],
    homeCmd: '$env:USERPROFILE',
    resolveCmd: (path) => `if (Test-Path -Path "${path}" -PathType Container) { (Get-Item "${path}").FullName } else { write-error 'not found' }`,
    prompt: '>',
    color: '#3b82f6',
  },
};

interface TermLine {
  text: string;
  type: 'stdout' | 'stderr' | 'info' | 'cmd' | 'error';
}

function lineColor(type: TermLine['type']): string {
  switch (type) {
    case 'cmd':    return '#22c55e';
    case 'stderr': return '#ef4444';
    case 'error':  return '#ef4444';
    case 'info':   return '#a78bfa';
    case 'stdout': return '#e0e0e0';
  }
}

function shortCwd(cwd: string): string {
  const parts = cwd.replace(/\//g, '\\').split('\\').filter(Boolean);
  if (parts.length <= 2) return cwd;
  return parts.slice(-2).join('\\');
}

export function Terminal() {
  const { t } = useTranslation();
  const termRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<TermLine[]>([
    { text: t('terminal.title'), type: 'info' },
    { text: t('terminal.shellSwitchHint'), type: 'info' },
    { text: '', type: 'info' },
  ]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [cwd, setCwd] = useState('C:\\Users');
  const [shell, setShell] = useState<ShellType>('cmd');
  const setTerminalCwd = useAppStore((s) => s.setTerminalCwd);
  const terminalCwd = useAppStore((s) => s.terminalCwd);

  const config = SHELL_CONFIGS[shell];

  // Sync cwd to global store for ChatPanel project context
  useEffect(() => {
    setTerminalCwd(cwd);
  }, [cwd, setTerminalCwd]);

  // Sync global terminalCwd to local cwd
  useEffect(() => {
    if (terminalCwd && terminalCwd !== cwd) {
      setCwd(terminalCwd);
    }
  }, [terminalCwd]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [history]);

  // Detect real home directory & update banner on mount / shell switch
  useEffect(() => {
    (async () => {
      try {
        const result = await Command.create(config.cmdName, [...config.args, config.homeCmd]).execute();
        const home = result.stdout.trim();
        if (home && !home.includes('%') && !home.includes('$env:') && home.length > 3) {
          setCwd(home);
        }
      } catch {
        // Non-critical
      }
      // init complete — home dir resolved;
    })();
  }, [shell]);

  const addLines = useCallback((lines: TermLine[]) => {
    setHistory((prev) => [...prev, ...lines]);
  }, []);

  const switchShell = useCallback(() => {
    setShell((prev) => (prev === 'cmd' ? 'powershell' : 'cmd'));
    setHistory((prev) => [
      ...prev,
      { text: `── Switched to ${SHELL_CONFIGS[shell === 'cmd' ? 'powershell' : 'cmd'].name} ──`, type: 'info' },
      { text: '', type: 'info' },
    ]);
  }, [shell]);

  const executeCommand = useCallback(async (rawCmd: string) => {
    const cfg = SHELL_CONFIGS[shell];
    const trimmed = rawCmd.trim();
    if (!trimmed) return;

    // Show the command in terminal
    addLines([{ text: `${cwd}${cfg.prompt} ${trimmed}`, type: 'cmd' }]);

    // --- Handle cd / Set-Location internally ---
    const cdMatch = shell === 'cmd'
      ? trimmed.match(/^cd\s*(.*)?$/i)
      : trimmed.match(/^(?:cd|Set-Location|sl)(?:\s+(.+))?$/i) || trimmed.match(/^\s*([a-zA-Z]:\s*)$/);
    if (cdMatch) {
      let target = (cdMatch[1] || '').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

      if (!target && shell === 'cmd') {
        addLines([{ text: cwd, type: 'stdout' }, { text: '', type: 'stdout' }]);
        return;
      }

      // cd with no args in PS goes to $HOME
      if (!target && shell === 'powershell') {
        target = process.env.USERPROFILE || 'C:\\Users';
      }

      if (!target) {
        // cmd: cd with no args echoes current directory
        if (shell === 'cmd') {
          addLines([{ text: cwd, type: 'stdout' }, { text: '', type: 'stdout' }]);
        }
        return;
      }

      // Resolve path relative to cwd if not absolute
      let resolved: string;
      if (/^[a-zA-Z]:\\/.test(target) || target.startsWith('\\\\')) {
        resolved = target.replace(/^(.):$/, '$1:\\');
      } else if (/^[a-zA-Z]:$/.test(target)) {
        resolved = target + '\\';
      } else {
        resolved = (cwd.endsWith('\\') ? cwd : cwd + '\\') + target;
      }

      // Strip /d flag (cmd only)
      if (shell === 'cmd' && (resolved.startsWith('/d ') || resolved.startsWith('/D '))) {
        resolved = resolved.slice(3).trim();
      }

      // Verify path exists
      try {
        const verify = await Command.create(cfg.cmdName, [...cfg.args, cfg.resolveCmd(resolved)]).execute();
        const newCwd = verify.stdout.trim();
        if (verify.code === 0 && newCwd && newCwd.length > 2) {
          setCwd(newCwd);
          addLines([{ text: '', type: 'stdout' }]);
        } else {
          addLines([
            { text: t('terminal.pathNotFound', { path: resolved }), type: 'stderr' },
            { text: '', type: 'stderr' },
          ]);
        }
      } catch (e) {
        addLines([{ text: `Error: ${String(e)}`, type: 'error' }, { text: '', type: 'error' }]);
      }
      return;
    }

    // --- Handle clear/cls ---
    if (trimmed.toLowerCase() === 'clear' || trimmed.toLowerCase() === 'cls') {
      setHistory([]);
      return;
    }

    // --- Execute command via shell ---
    setIsRunning(true);
    try {
      const command = Command.create(cfg.cmdName, [...cfg.args, trimmed], { cwd });
      const output = await command.execute();

      if (output.stdout) {
        const lines = output.stdout.split('\n').filter(Boolean).map((line) => ({
          text: line,
          type: 'stdout' as const,
        }));
        addLines(lines);
      }

      if (output.stderr) {
        const lines = output.stderr.split('\n').filter(Boolean).map((line) => ({
          text: line,
          type: 'stderr' as const,
        }));
        addLines(lines);
      }

      if (output.code !== null && output.code !== 0) {
        addLines([{ text: `[Exit code: ${output.code}]`, type: 'error' }]);
      }
    } catch (e) {
      addLines([
        { text: `Failed to execute: ${String(e)}`, type: 'error' },
        { text: t('terminal.permissionHint'), type: 'info' },
      ]);
    } finally {
      setIsRunning(false);
      addLines([{ text: '', type: 'stdout' }]);
    }
  }, [cwd, shell, addLines]);

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
        background: '#0c0c18',
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        fontSize: '13px',
      }}
    >
      {/* Shell toggle bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          gap: '8px',
          background: '#0a0a14',
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#6b7280', fontSize: '11px', fontWeight: 500 }}>
          Shell:
        </span>
        <button
          onClick={switchShell}
          title="Click to switch shell"
          style={{
            background: shell === 'cmd' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
            border: `1px solid ${shell === 'cmd' ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)'}`,
            borderRadius: '4px',
            padding: '2px 10px',
            color: config.color,
            fontFamily: 'inherit',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = shell === 'cmd'
              ? 'rgba(34,197,94,0.25)'
              : 'rgba(59,130,246,0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = shell === 'cmd'
              ? 'rgba(34,197,94,0.15)'
              : 'rgba(59,130,246,0.15)';
          }}
        >
          {config.name}
        </button>
        {isRunning && <span style={{ color: '#6b7280', fontSize: '11px' }}>⏳ {t('terminal.running')}</span>}
      </div>

      {/* Output */}
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

      {/* Input */}
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
          style={{
            color: config.color,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            fontSize: '12px',
          }}
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
            color: '#e0e0e0',
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
