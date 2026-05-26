// ==============================================================================
// GHITA CODING AGENT — Shell Execution Utility
// Shared utility for executing commands via @tauri-apps/plugin-shell
// ==============================================================================

import { Command } from '@tauri-apps/plugin-shell';

export type ShellType = 'cmd' | 'powershell';

export interface ShellResult {
  stdout: string;
  stderr: string;
  code: number | null;
  success: boolean;
}

const SHELL_CONFIGS: Record<ShellType, { cmdName: string; args: string[] }> = {
  cmd: { cmdName: 'cmd', args: ['/c'] },
  powershell: { cmdName: 'powershell', args: ['-NoProfile', '-Command'] },
};

/**
 * Execute a shell command via @tauri-apps/plugin-shell
 */
export async function executeShellCommand(
  command: string,
  shell: ShellType = 'cmd',
): Promise<ShellResult> {
  const cfg = SHELL_CONFIGS[shell];
  try {
    const result = await Command.create(cfg.cmdName, [...cfg.args, command]).execute();
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      code: result.code,
      success: result.code === 0,
    };
  } catch (e) {
    return {
      stdout: '',
      stderr: String(e),
      code: -1,
      success: false,
    };
  }
}

/**
 * Execute a command using the best shell for the platform.
 * On Windows, prefers cmd for simple commands and powershell for complex ones.
 */
export async function runCommand(command: string): Promise<ShellResult> {
  // Auto-detect: use powershell for Start-Process or PS-specific commands
  const usePowerShell = /^(Start-Process|Get-|Set-|New-|Remove-|Invoke-)/i.test(command.trim());
  return executeShellCommand(command, usePowerShell ? 'powershell' : 'cmd');
}
