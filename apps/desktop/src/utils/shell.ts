// ==============================================================================
// GHITA CODING AGENT — Shell Execution Utility
// Shared utility for executing commands via @tauri-apps/plugin-shell
// ==============================================================================

import { Command } from '@tauri-apps/plugin-shell';

export type ShellType = 'cmd' | 'powershell';

export interface SecurityScanResult {
  safe: boolean;
  reason?: string;
  threatLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

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

const MALICIOUS_PATTERNS: Array<{
  regex: RegExp;
  reason: string;
  threatLevel: NonNullable<SecurityScanResult['threatLevel']>;
}> = [
  {
    regex: /rm\s+-rf?\s+([/*~]|\.\.?)/i,
    reason: 'Phát hiện lệnh rm -rf trên thư mục nhạy cảm.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /:\(\)\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    reason: 'Phát hiện fork bomb.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /dd\s+if=.*of=/i,
    reason: 'Phát hiện lệnh ghi đè block trực tiếp qua dd.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /(curl|wget|fetch)\s+.*\s*\|\s*(bash|sh|zsh|powershell|pwsh)/i,
    reason: 'Phát hiện tải script từ internet và thực thi trực tiếp.',
    threatLevel: 'HIGH',
  },
  {
    regex: /mkfs(\..*)?\s+/i,
    reason: 'Phát hiện lệnh format ổ đĩa.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /(shutdown|reboot|poweroff|init\s+0)/i,
    reason: 'Phát hiện lệnh tắt nguồn hoặc khởi động lại máy.',
    threatLevel: 'HIGH',
  },
  {
    regex: /(bash|sh|zsh)\s+-i\s*>&?/i,
    reason: 'Phát hiện interactive shell đáng ngờ.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /nc\s+.*-e\s+/i,
    reason: 'Phát hiện Netcat thực thi lệnh từ xa.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /\/dev\/tcp\/\d{1,5}\/\d{1,5}/i,
    reason: 'Phát hiện kết nối /dev/tcp đáng ngờ.',
    threatLevel: 'HIGH',
  },
  {
    regex: /(echo|tee|cat|>)\s+.*\/etc\/(passwd|shadow|sudoers|hosts)/i,
    reason: 'Phát hiện truy cập tệp hệ thống nhạy cảm.',
    threatLevel: 'HIGH',
  },
  {
    regex: /chmod\s+777\s+/i,
    reason: 'Phát hiện cấp quyền 777.',
    threatLevel: 'MEDIUM',
  },
];

export function assessShellCommand(command: string): SecurityScanResult {
  const trimmed = command.trim();
  if (!trimmed) {
    return { safe: true };
  }

  for (const pattern of MALICIOUS_PATTERNS) {
    if (pattern.regex.test(trimmed)) {
      return {
        safe: false,
        reason: pattern.reason,
        threatLevel: pattern.threatLevel,
      };
    }
  }

  return { safe: true };
}

/**
 * Execute a shell command via @tauri-apps/plugin-shell
 */
export async function executeShellCommand(
  command: string,
  shell: ShellType = 'cmd',
  cwd?: string,
): Promise<ShellResult> {
  const assessment = assessShellCommand(command);
  if (!assessment.safe && assessment.threatLevel === 'CRITICAL') {
    return {
      stdout: '',
      stderr: assessment.reason || 'Blocked by security policy.',
      code: -1,
      success: false,
    };
  }

  const cfg = SHELL_CONFIGS[shell];
  try {
    const result = await Command.create(
      cfg.cmdName,
      [...cfg.args, command],
      cwd ? { cwd } : undefined,
    ).execute();
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
export async function runCommand(command: string, cwd?: string): Promise<ShellResult> {
  // Auto-detect: use powershell for Start-Process or PS-specific commands
  const usePowerShell = /^(Start-Process|Get-|Set-|New-|Remove-|Invoke-)/i.test(command.trim());
  return executeShellCommand(command, usePowerShell ? 'powershell' : 'cmd', cwd);
}
