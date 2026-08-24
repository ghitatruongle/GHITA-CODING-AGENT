export interface SecurityScanResult {
  safe: boolean;
  reason?: string;
  threatLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const MALICIOUS_PATTERNS: Array<{
  regex: RegExp;
  reason: string;
  threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}> = [
  {
    regex: /rm\s+-rf?\s+([/*~]|\.\.?)/i,
    reason:
      'Phát hiện lệnh rm -rf trên thư mục nhạy cảm (root, wildcard, home hoặc parent). Có thể gây mất mát toàn bộ dữ liệu.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /:\(\)\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    reason:
      'Phát hiện Fork bomb, có thể gây tràn tài nguyên RAM/CPU và treo hệ thống ngay lập tức.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /dd\s+if=.*of=/i,
    reason:
      'Phát hiện lệnh ghi đè block trực tiếp qua dd, nguy cơ làm hỏng phân vùng ổ cứng hệ thống.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /(curl|wget|fetch)\s+.*\s*\|\s*(bash|sh|zsh|powershell|pwsh)/i,
    reason:
      'Phát hiện cơ chế tải script từ internet và thực thi trực tiếp qua shell, nguy cơ chạy mã độc hại giấu tên.',
    threatLevel: 'HIGH',
  },
  {
    regex: /mkfs(\..*)?\s+/i,
    reason: 'Phát hiện lệnh format ổ đĩa / tạo hệ thống tệp mới.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /(shutdown|reboot|poweroff|init\s+0)/i,
    reason: 'Phát hiện lệnh tắt nguồn, khởi động lại hoặc thay đổi runlevel của máy tính.',
    threatLevel: 'HIGH',
  },
  {
    regex: /(bash|sh|zsh)\s+-i\s*>&?/i,
    reason:
      'Phát hiện hành vi khởi tạo interactive shell, thường được dùng trong các cuộc tấn công reverse shell.',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /nc\s+.*-e\s+/i,
    reason: 'Phát hiện Netcat thực thi lệnh từ xa (reverse shell / backdoor).',
    threatLevel: 'CRITICAL',
  },
  {
    regex: /\/dev\/tcp\/\d{1,5}\/\d{1,5}/i,
    reason: 'Phát hiện cố gắng kết nối mạng thô trực tiếp qua file ảo /dev/tcp (reverse shell).',
    threatLevel: 'HIGH',
  },
  {
    regex: /(echo|tee|cat|>)\s+.*\/etc\/(passwd|shadow|sudoers|hosts)/i,
    reason:
      'Phát hiện nỗ lực sửa đổi hoặc đọc các tệp cấu hình hệ thống nhạy cảm của hệ điều hành.',
    threatLevel: 'HIGH',
  },
  {
    regex: /chmod\s+777\s+/i,
    reason:
      'Phát hiện nỗ lực cấp quyền đọc, ghi và thực thi tối đa (chmod 777) cho file hoặc thư mục.',
    threatLevel: 'MEDIUM',
  },
];

export class SecurityGuard {
  
  static scanCommand(command: string): SecurityScanResult {
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

  static scanToolUse(toolName: string, args: Record<string, unknown>): SecurityScanResult {
    
    if (['execute_command', 'run_command', 'run_bash', 'terminal_run'].includes(toolName)) {
      const command = args?.command || args?.CommandLine || args?.cmd || '';
      if (typeof command === 'string') {
        return this.scanCommand(command);
      }
    }

    const stringValues = this.extractStringValues(args);
    for (const val of stringValues) {
      const result = this.scanCommand(val);
      if (!result.safe) {
        return {
          safe: false,
          reason: `Phát hiện tham số chứa chuỗi nguy hiểm: ${result.reason}`,
          threatLevel: result.threatLevel,
        };
      }
    }

    return { safe: true };
  }

  private static extractStringValues(obj: unknown): string[] {
    const strings: string[] = [];
    if (!obj) return strings;

    if (typeof obj === 'string') {
      strings.push(obj);
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        strings.push(...this.extractStringValues(item));
      }
    } else if (typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        strings.push(...this.extractStringValues(record[key]));
      }
    }

    return strings;
  }
}
