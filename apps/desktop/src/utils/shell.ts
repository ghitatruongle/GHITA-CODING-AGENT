// ==============================================================================
// GHITA CODING AGENT — Shell Execution Utility
// Shared utility for executing commands through the native audited command gate.
//
// The former plugin-shell `args: true` capability was removed in v0.6.0.
// Commands now pass both this client-side preview and a native Rust gate.
// ==============================================================================

import { invoke } from '@tauri-apps/api/core';

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
  // deep-review fix (L1): Windows destructive patterns that previously
  // bypassed the scan entirely.
  {
    regex: /\bdel\s+\/[fsq]+\s+.*[a-zA-Z]:[\\/]/i,
    reason: 'Phát hiện xóa file hệ thống Windows bằng del /f /s /q.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /\brmdir\s+\/[sq]+\s+.*[a-zA-Z]:[\\/]/i,
    reason: 'Phát hiện xóa thư mục hệ thống Windows bằng rmdir /s /q.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /\btaskkill\s+\/F\b/i,
    reason: 'Phát hiện force-kill process bằng taskkill /F.',
    threatLevel: 'MEDIUM',
  },
];

/**
 * Normalize a command before pattern matching: strip quote characters and the
 * `--` end-of-options marker so `rm -rf "/"`, `rm -rf -- /` and drive-letter
 * paths can no longer bypass the blocklist regexes (deep-review fix M8). The
 * native Rust gate remains the enforcement layer; this makes the client-side
 * preview consistent with it.
 */
function normalizeForScan(command: string): string {
  return (
    command
      .replace(/["'`]/g, '')
      .replace(/\s+--\s+/g, ' ')
      .replace(/^--\s+/, '')
      // Windows drive paths: `rm -rf C:/Users/x` → `rm -rf c:/users/x`
      .replace(/\b([a-zA-Z]):[\\/]/g, (m) => m.toLowerCase())
  );
}

export function assessShellCommand(command: string): SecurityScanResult {
  const trimmed = command.trim();
  if (!trimmed) {
    return { safe: true };
  }

  // deep-review fix (M8): match against the quote-stripped form so quoted
  // arguments are scanned identically to unquoted ones.
  const scanTarget = normalizeForScan(trimmed);

  for (const pattern of MALICIOUS_PATTERNS) {
    if (pattern.regex.test(scanTarget)) {
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
 * Execute a shell command through the native Rust command gate.
 */
export async function executeShellCommand(
  command: string,
  shell: ShellType = 'cmd',
  cwd?: string,
  timeoutMs = 120_000,
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

  try {
    return await invoke<ShellResult>('execute_approved_command', {
      command,
      shell,
      cwd,
      timeoutMs,
    });
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
