// @vitest-environment happy-dom
// ==============================================================================
// GHITA CODING AGENT — Terminal Unit Tests
// Covers: shell toggle, command execution, cd handling, clear, input/output
// ==============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Shared mock state ────────────────────────────────────────────────────

const mockExecute = vi.fn();
const mockSetTerminalCwd = vi.fn();

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    create: vi.fn(),
  },
}));

vi.mock('@xterm/xterm', () => ({}));
vi.mock('@xterm/addon-fit', () => ({}));

vi.mock('../stores/appStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      terminalCwd: '',
      setTerminalCwd: mockSetTerminalCwd,
    };
    return selector(state);
  },
}));

vi.mock('../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'terminal.title': 'GHITA Terminal',
        'terminal.shellSwitchHint': 'Click the shell button to switch between cmd and PowerShell',
        'terminal.running': 'Running...',
        'terminal.placeholder': 'Type a command...',
        'terminal.permissionHint': 'Check permissions',
        'terminal.pathNotFound': `Path not found: ${params?.path ?? ''}`,
      };
      return translations[key] ?? key;
    },
  }),
}));

import { Terminal } from './Terminal';
import { Command } from '@tauri-apps/plugin-shell';

// ── Tests ────────────────────────────────────────────────────────────────

describe('Terminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Command.create as any).mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('echo %USERPROFILE%') || args.includes('$env:USERPROFILE')) {
        return {
          execute: () => Promise.resolve({ stdout: 'C:\\Users\\Test', stderr: '', code: 0 }),
        };
      }
      return { execute: mockExecute };
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  //  Shell toggle
  // ────────────────────────────────────────────────────────────────────────

  describe('shell toggle', () => {
    it('shows cmd.exe by default', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });
    });

    it('toggles to PowerShell on click', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('cmd.exe'));
      expect(screen.getByText('PowerShell')).toBeInTheDocument();
    });

    it('toggles back to cmd.exe on second click', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('cmd.exe'));
      expect(screen.getByText('PowerShell')).toBeInTheDocument();

      fireEvent.click(screen.getByText('PowerShell'));
      expect(screen.getByText('cmd.exe')).toBeInTheDocument();
    });

    it('shows switch message in history when toggling', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('cmd.exe'));
      expect(screen.getByText(/Switched to PowerShell/)).toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  //  Command execution
  // ────────────────────────────────────────────────────────────────────────

  describe('command execution', () => {
    it('executes command on Enter key', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });
      mockExecute.mockResolvedValue({ stdout: 'hello world', stderr: '', code: 0 });

      const input = screen.getByPlaceholderText('Type a command...');
      fireEvent.change(input, { target: { value: 'echo hello world' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('hello world')).toBeInTheDocument();
      });
    });

    it('displays command in history with prompt', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Type a command...');
      fireEvent.change(input, { target: { value: 'dir' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText(/dir/)).toBeInTheDocument();
      });
    });

    it('displays stderr output', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });
      mockExecute.mockResolvedValue({ stdout: '', stderr: 'error message', code: 1 });

      const input = screen.getByPlaceholderText('Type a command...');
      fireEvent.change(input, { target: { value: 'badcommand' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('error message')).toBeInTheDocument();
      });
    });

    it('displays exit code on non-zero exit', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });
      mockExecute.mockResolvedValue({ stdout: '', stderr: '', code: 1 });

      const input = screen.getByPlaceholderText('Type a command...');
      fireEvent.change(input, { target: { value: 'exit 1' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('[Exit code: 1]')).toBeInTheDocument();
      });
    });

    it('does not execute empty commands', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Type a command...');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Should not call Command.create for execution (only for home detection)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executeCalls = (Command.create as any).mock.calls.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => !(call[1] as string[])?.some((arg: string) => arg.includes('USERPROFILE')),
      );
      expect(executeCalls).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  //  cd command handling
  // ────────────────────────────────────────────────────────────────────────

  describe('cd command', () => {
    it('changes directory and syncs to store', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Command.create as any).mockImplementation((_cmd: string, args: string[]) => {
        if (args.some((a: string) => a.includes('Test-Path') || a.includes('cd /d'))) {
          return {
            execute: () => Promise.resolve({ stdout: 'C:\\Projects\\MyApp', stderr: '', code: 0 }),
          };
        }
        return {
          execute: () => Promise.resolve({ stdout: 'C:\\Users\\Test', stderr: '', code: 0 }),
        };
      });

      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Type a command...');
      fireEvent.change(input, { target: { value: 'cd C:\\Projects\\MyApp' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockSetTerminalCwd).toHaveBeenCalledWith('C:\\Projects\\MyApp');
      });
    });

    it('shows error for non-existent path', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Command.create as any).mockImplementation((_cmd: string, args: string[]) => {
        if (args.some((a: string) => a.includes('Test-Path') || a.includes('cd /d'))) {
          return { execute: () => Promise.resolve({ stdout: '', stderr: 'not found', code: 1 }) };
        }
        return {
          execute: () => Promise.resolve({ stdout: 'C:\\Users\\Test', stderr: '', code: 0 }),
        };
      });

      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Type a command...');
      fireEvent.change(input, { target: { value: 'cd C:\\NonExistent' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText(/Path not found/)).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  //  Clear command
  // ────────────────────────────────────────────────────────────────────────

  describe('clear command', () => {
    it('clears history on "clear" command', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });

      // First add some output
      const input = screen.getByPlaceholderText('Type a command...');
      fireEvent.change(input, { target: { value: 'echo test' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText(/echo test/)).toBeInTheDocument();
      });

      // Now clear
      fireEvent.change(input, { target: { value: 'clear' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.queryByText(/echo test/)).not.toBeInTheDocument();
      });
    });

    it('clears history on "cls" command', async () => {
      render(<Terminal />);
      await waitFor(() => {
        expect(screen.getByText('cmd.exe')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Type a command...');
      fireEvent.change(input, { target: { value: 'echo test' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText(/echo test/)).toBeInTheDocument();
      });

      fireEvent.change(input, { target: { value: 'cls' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.queryByText(/echo test/)).not.toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  //  Initial render
  // ────────────────────────────────────────────────────────────────────────

  describe('initial render', () => {
    it('shows terminal title and hint', async () => {
      render(<Terminal />);
      expect(screen.getByText('GHITA Terminal')).toBeInTheDocument();
      expect(screen.getByText(/Click the shell button/)).toBeInTheDocument();
    });

    it('has an input field', async () => {
      render(<Terminal />);
      expect(screen.getByPlaceholderText('Type a command...')).toBeInTheDocument();
    });
  });
});
