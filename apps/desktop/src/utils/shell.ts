// ==============================================================================
// GHITA CODING AGENT — Shell Execution Utility
// Shared utility for executing commands via @tauri-apps/plugin-shell
//
// TODO(Phase 5): capabilities/default.json currently allows shell:allow-execute
// with args:true for cmd + powershell. Tighten by replacing the generic shell
// capability with a pinned sidecar binary, or whitelist command validators at
// the Tauri capability level. Until then, MALICIOUS_PATTERNS below is the
// primary runtime defense layer.
// ==============================================================================

import { Command } from '@tauri-apps/plugin-shell';

export type ShellType = 'cmd' | 'powershell' | 'bash' | 'sh';

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
  bash: { cmdName: 'bash', args: ['-c'] },
  sh: { cmdName: 'sh', args: ['-c'] },
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
  {
    regex: /\b(format|diskpart)\s+/i,
    reason: 'Phát hiện lệnh format/diskpart ổ đĩa.',
    threatLevel: 'HIGH',
  },
  {
    regex: /\breg\s+(add|delete|import)\s+.*HKLM/i,
    reason: 'Phát hiện chỉnh sửa registry hệ thống (HKLM).',
    threatLevel: 'HIGH',
  },
  {
    regex: /\b(taskkill|kill)\s+.*-9\b/i,
    reason: 'Phát hiện kill process cưỡng chế (-9 / SIGKILL).',
    threatLevel: 'MEDIUM',
  },
  {
    regex: /\b(iex|Invoke-Expression|eval)\s*[("]/i,
    reason: 'Phát hiện thực thi chuỗi động (eval/Invoke-Expression) — nguy cơ injection.',
    threatLevel: 'HIGH',
  },
  {
    regex: /\bnet\s+(user|localgroup)\s+.*\/add/i,
    reason: 'Phát hiện tạo user/group hệ thống.',
    threatLevel: 'HIGH',
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
  if (
    !assessment.safe &&
    (assessment.threatLevel === 'CRITICAL' || assessment.threatLevel === 'HIGH')
  ) {
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
 * Detects bash/sh commands by common Unix patterns.
 */
export async function runCommand(command: string, cwd?: string): Promise<ShellResult> {
  const trimmed = command.trim();
  // Auto-detect: use powershell for Start-Process or PS-specific commands
  if (/^(Start-Process|Get-|Set-|New-|Remove-|Invoke-)/i.test(trimmed)) {
    return executeShellCommand(command, 'powershell', cwd);
  }
  // Auto-detect: use bash/sh for Unix-style commands (ls, grep, chmod, ./script, etc.)
  if (
    /^(ls|grep|find|chmod|chown|cp|mv|rm|cat|head|tail|wc|sort|uniq|diff|tar|gzip|gunzip|wget|curl|ssh|scp|rsync|sed|awk|echo|export|source|cd|pwd|which|man|mkdir|rmdir|touch|ln|du|df|ps|kill|bg|fg|jobs|nohup|screen|tmux)\b/.test(
      trimmed,
    ) ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('/')
  ) {
    return executeShellCommand(command, 'bash', cwd);
  }
  return executeShellCommand(command, 'cmd', cwd);
}
