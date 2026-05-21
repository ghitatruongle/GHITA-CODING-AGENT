// ==============================================================================
// GHITA CODING AGENT - Behavioral & Security Hooks
// ==============================================================================
// Phân tích và ngăn chặn các hành vi nguy hại trước khi gọi tools.
// Hoạt động như một chốt chặn bảo mật (sandbox shield).
// ==============================================================================

import type { HookResult } from './types.js';

export type SecurityRiskLevel = 'safe' | 'warning' | 'critical';

export interface SecurityAnalysis {
  riskLevel: SecurityRiskLevel;
  explanation: string;
  blocked: boolean;
}

const DANGEROUS_COMMAND_PATTERNS = [
  // Hủy hoại file system hệ thống
  { regex: /\brm\s+-[rf]{1,2}\s+\/\b/i, risk: 'critical', explanation: 'Phát hiện câu lệnh xóa thư mục gốc nguy hiểm (rm -rf /).' },
  { regex: /\brm\s+-[rf]{1,2}\s+(?:C:\\|D:\\|\*)\b/i, risk: 'critical', explanation: 'Phát hiện lệnh xóa ổ đĩa hoặc toàn bộ tập tin hệ thống.' },
  
  // Tải & thực thi script không tin cậy trực tiếp
  { regex: /\bcurl\s+.*\|\s*(?:bash|sh|zsh)\b/i, risk: 'warning', explanation: 'Tải và chạy script trực tiếp từ Internet qua curl | sh có độ rủi ro cao.' },
  { regex: /\bwget\s+.*\|\s*(?:bash|sh|zsh)\b/i, risk: 'warning', explanation: 'Tải và chạy script trực tiếp từ Internet qua wget | sh có độ rủi ro cao.' },
  
  // Chạy câu lệnh mã độc từ xa hoặc fork bomb
  { regex: /:\(\)\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, risk: 'critical', explanation: 'Phát hiện cấu trúc lệnh Fork Bomb gây sập hệ thống.' },
  
  // Sửa quyền thư mục nhạy cảm
  { regex: /\bchmod\s+-[R\s]*777\s+\/\b/i, risk: 'critical', explanation: 'Phát hiện hành vi gán quyền ghi đọc rộng rãi cho thư mục gốc.' },
];

const DANGEROUS_WRITE_PATTERNS = [
  // Shell/Reverse shell scripts injection
  { regex: /bash\s+-i\s*>\s*&\s*\/dev\/tcp\//i, risk: 'critical', explanation: 'Phát hiện cấu trúc thiết lập Reverse Shell kết nối ngoài.' },
  // Dangerous system overwrites
  { regex: /(?:System32|etc\/passwd|etc\/shadow)/i, risk: 'critical', explanation: 'Phát hiện hành động cố gắng can thiệp/ghi đè file hệ thống nhạy cảm.' },
];

export class SecurityChecker {
  /**
   * Phân tích câu lệnh shell (dành cho terminal.run)
   */
  checkCommand(command: string): SecurityAnalysis {
    const trimmedCmd = command.trim();

    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.regex.test(trimmedCmd)) {
        return {
          riskLevel: pattern.risk as SecurityRiskLevel,
          explanation: pattern.explanation,
          blocked: pattern.risk === 'critical',
        };
      }
    }

    return {
      riskLevel: 'safe',
      explanation: 'Lệnh an toàn hoặc không khớp mẫu nguy hại đã biết.',
      blocked: false,
    };
  }

  /**
   * Phân tích nội dung ghi file (dành cho file.write)
   */
  checkFileWrite(path: string, content: string): SecurityAnalysis {
    const lowerPath = path.toLowerCase();
    
    // Ngăn chặn ghi đè trực tiếp các tệp cấu hình hệ thống
    if (lowerPath.includes('system32') || lowerPath.includes('etc/passwd') || lowerPath.includes('etc/shadow')) {
      return {
        riskLevel: 'critical',
        explanation: 'Không được phép chỉnh sửa các tập tin cấu hình nhạy cảm của hệ điều hành.',
        blocked: true,
      };
    }

    for (const pattern of DANGEROUS_WRITE_PATTERNS) {
      if (pattern.regex.test(content)) {
        return {
          riskLevel: pattern.risk as SecurityRiskLevel,
          explanation: pattern.explanation,
          blocked: pattern.risk === 'critical',
        };
      }
    }

    return {
      riskLevel: 'safe',
      explanation: 'Nội dung ghi file an toàn.',
      blocked: false,
    };
  }

  /**
   * Đăng ký bộ checker này thành một PreTool hook trong orchestrator
   */
  createPreToolHook(): {
    event: 'pre_tool';
    matcher: { tool: string };
    command: string; // Tên của checker hành động
    enabled: boolean;
    handler: (toolName: string, args: Record<string, unknown>) => Promise<HookResult>;
  } {
    return {
      event: 'pre_tool',
      matcher: { tool: '*' },
      command: 'security_pre_shield',
      enabled: true,
      handler: async (toolName, args) => {
        const start = Date.now();
        
        if (toolName === 'terminal.run') {
          const command = (args['command'] as string) || '';
          const analysis = this.checkCommand(command);
          
          if (analysis.blocked) {
            return {
              success: false,
              error: `[BẢO MẬT CHẶN]: ${analysis.explanation}`,
              durationMs: Date.now() - start,
            };
          }
        }

        if (toolName === 'file.write') {
          const path = (args['path'] as string) || '';
          const content = (args['content'] as string) || '';
          const analysis = this.checkFileWrite(path, content);
          
          if (analysis.blocked) {
            return {
              success: false,
              error: `[BẢO MẬT CHẶN]: ${analysis.explanation}`,
              durationMs: Date.now() - start,
            };
          }
        }

        return {
          success: true,
          durationMs: Date.now() - start,
        };
      },
    };
  }
}
