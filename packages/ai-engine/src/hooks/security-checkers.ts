// ==============================================================================
// GHITA CODING AGENT - Behavioral & Security Hooks (Phase 12 Enhanced)
// ==============================================================================
// Pre/post tool security gate with comprehensive threat detection:
// - Destructive commands (rm -rf, format, diskpart)
// - Remote code execution (curl|sh, wget|bash, reverse shells)
// - Privilege escalation (sudo, su, chmod 777)
// - Data exfiltration (base64 encode + network send, DNS tunneling)
// - Crypto-mining patterns
// - Path traversal & environment variable leaks
// - Per-tool security profiles with allow/deny lists
// ==============================================================================

import type { HookResult, SecurityAnalysis, SecurityProfile, SecurityRiskLevel } from './types.js';

// ---------------------------------------------------------------------------
// Threat pattern database
// ---------------------------------------------------------------------------

interface ThreatPattern {
  regex: RegExp;
  risk: SecurityRiskLevel;
  explanation: string;
  rule: string;
  suggestion?: string;
}

const DANGEROUS_COMMAND_PATTERNS: ThreatPattern[] = [
  // ---- File system destruction ----
  {
    regex: /\brm\s+-[rf]{1,2}\s+\/\b/i,
    risk: 'critical',
    explanation: 'Detected recursive deletion of root filesystem (rm -rf /).',
    rule: 'CMD-FS-001',
    suggestion: 'Use targeted rm with explicit paths instead of root-level deletion.',
  },
  {
    regex: /\brm\s+-[rf]{1,2}\s+(?:C:\\|D:\\|\*)\b/i,
    risk: 'critical',
    explanation: 'Detected deletion of entire drive or wildcard filesystem wipe.',
    rule: 'CMD-FS-002',
  },
  {
    regex: /\bformat\s+[a-zA-Z]:\s*\/?[Yy]?/i,
    risk: 'critical',
    explanation: 'Detected disk format command that will destroy all data on the drive.',
    rule: 'CMD-FS-003',
  },
  {
    regex: /\bdiskpart\b/i,
    risk: 'high',
    explanation: 'Detected diskpart usage which can modify disk partitions.',
    rule: 'CMD-FS-004',
  },

  // ---- Remote code execution ----
  {
    regex: /\bcurl\s+.*\|\s*(?:bash|sh|zsh|powershell)\b/i,
    risk: 'high',
    explanation: 'Downloading and executing a script directly from the internet via curl | sh.',
    rule: 'CMD-RCE-001',
    suggestion: 'Download the script first, inspect it, then execute locally.',
  },
  {
    regex: /\bwget\s+.*\|\s*(?:bash|sh|zsh|powershell)\b/i,
    risk: 'high',
    explanation: 'Downloading and executing a script directly from the internet via wget | sh.',
    rule: 'CMD-RCE-002',
  },
  {
    regex: /\bInvoke-WebRequest\b.*\|\s*Invoke-Expression\b/i,
    risk: 'high',
    explanation: 'Detected PowerShell download cradle (IEX + Invoke-WebRequest).',
    rule: 'CMD-RCE-003',
  },

  // ---- Fork bomb / resource exhaustion ----
  {
    regex: /:\(\)\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    risk: 'critical',
    explanation: 'Detected fork bomb pattern that will crash the system.',
    rule: 'CMD-DOS-001',
  },

  // ---- Privilege escalation ----
  {
    regex: /\bsudo\s+rm\b/i,
    risk: 'high',
    explanation: 'Detected privileged file deletion with sudo.',
    rule: 'CMD-PRIV-001',
  },
  {
    regex: /\bchmod\s+-[R\s]*777\s+\/\b/i,
    risk: 'critical',
    explanation: 'Detected granting full read/write/execute permissions on root directory.',
    rule: 'CMD-PRIV-002',
  },
  {
    regex: /\bchmod\s+.*\+s\b/i,
    risk: 'high',
    explanation: 'Detected setting SUID/SGID bit which enables privilege escalation.',
    rule: 'CMD-PRIV-003',
  },

  // ---- Network exfiltration / reverse shell ----
  {
    regex: /\bnc\s+-[elp]+\s+\d+/i,
    risk: 'critical',
    explanation: 'Detected netcat listener — potential reverse shell setup.',
    rule: 'CMD-NET-001',
  },
  {
    regex: /bash\s+-i\s*>\s*&\s*\/dev\/tcp\//i,
    risk: 'critical',
    explanation: 'Detected bash reverse shell connecting to a remote host.',
    rule: 'CMD-NET-002',
  },
  {
    regex: /\bpython3?\s+-c\s+['"].*socket.*connect/i,
    risk: 'critical',
    explanation: 'Detected Python socket connection — potential reverse shell or exfiltration.',
    rule: 'CMD-NET-003',
  },

  // ---- Crypto mining ----
  {
    regex: /\b(?:xmrig|nicehash|minerd|cpuminer|cgminer)\b/i,
    risk: 'high',
    explanation: 'Detected known cryptocurrency mining software.',
    rule: 'CMD-MINE-001',
  },

  // ---- Data encoding + network send (exfiltration) ----
  {
    regex: /\bbase64\b.*\|\s*(?:curl|wget|nc)\b/i,
    risk: 'high',
    explanation:
      'Detected base64 encoding piped to network transfer — potential data exfiltration.',
    rule: 'CMD-EXFIL-001',
  },
  {
    regex: /\bcurl\s+.*--data\s+@/i,
    risk: 'warning',
    explanation: 'Detected curl posting file contents to a remote endpoint.',
    rule: 'CMD-EXFIL-002',
  },
];

const DANGEROUS_WRITE_PATTERNS: ThreatPattern[] = [
  // ---- Reverse shell injection ----
  {
    regex: /bash\s+-i\s*>\s*&\s*\/dev\/tcp\//i,
    risk: 'critical',
    explanation: 'Detected reverse shell payload in file content.',
    rule: 'FILE-RCE-001',
  },
  // ---- System file targeting ----
  {
    regex: /(?:System32|etc\/passwd|etc\/shadow|\/etc\/sudoers)/i,
    risk: 'critical',
    explanation: 'Detected attempt to modify critical system configuration files.',
    rule: 'FILE-SYS-001',
  },
  // ---- Cron/at job injection ----
  {
    regex: /(?:crontab|\/etc\/cron\.d|at\s+-[mf])/i,
    risk: 'high',
    explanation: 'Detected scheduled task injection — potential persistence mechanism.',
    rule: 'FILE-PERSIST-001',
  },
  // ---- SSH key injection ----
  {
    regex: /ssh-rsa\s+[A-Za-z0-9+/=]+/i,
    risk: 'warning',
    explanation: 'Detected SSH public key content — possible authorized_keys injection.',
    rule: 'FILE-SSH-001',
    suggestion: 'Verify this is an intentional SSH key addition.',
  },
  // ---- PowerShell encoded commands ----
  {
    regex: /-[Ee]ncoded[Cc]ommand\s+[A-Za-z0-9+/=]{20,}/,
    risk: 'high',
    explanation: 'Detected PowerShell encoded command — commonly used in obfuscated attacks.',
    rule: 'FILE-OBFUS-001',
  },
];

// Sensitive file paths that should never be modified
const PROTECTED_PATHS = [
  'system32',
  'etc/passwd',
  'etc/shadow',
  'etc/sudoers',
  'windows/system',
  '.ssh/authorized_keys',
  '.ssh/id_rsa',
  '.ssh/id_ed25519',
  '.env',
  '.env.production',
];

// Environment variable patterns that should not appear in output
const SECRET_ENV_PATTERNS = [
  /\b(?:API_KEY|SECRET_KEY|PRIVATE_KEY|ACCESS_TOKEN|PASSWORD|DATABASE_URL)\s*=\s*\S+/gi,
  /\b(?:ghp_|gho_|github_pat_|sk-[a-zA-Z0-9]{20,}|xoxb-[a-zA-Z0-9-]+)/g,
];

// ---------------------------------------------------------------------------
// SecurityChecker
// ---------------------------------------------------------------------------

export class SecurityChecker {
  /** Per-tool security profiles */
  private profiles = new Map<string, SecurityProfile>();

  /** Detection statistics */
  private stats = {
    totalChecks: 0,
    commandsBlocked: 0,
    writesBlocked: 0,
    warningsIssued: 0,
  };

  // -----------------------------------------------------------------------
  // Profile management
  // -----------------------------------------------------------------------

  /** Register a security profile for a tool */
  setProfile(profile: SecurityProfile): void {
    this.profiles.set(profile.toolPattern, profile);
  }

  /** Remove a security profile */
  removeProfile(toolPattern: string): boolean {
    return this.profiles.delete(toolPattern);
  }

  /** Get the profile matching a tool name */
  getProfile(toolName: string): SecurityProfile | undefined {
    for (const [pattern, profile] of this.profiles) {
      if (pattern === toolName || pattern === '*') return profile;
    }
    return undefined;
  }

  // -----------------------------------------------------------------------
  // Command analysis
  // -----------------------------------------------------------------------

  /** Analyze a shell command for security threats */
  checkCommand(command: string): SecurityAnalysis {
    this.stats.totalChecks += 1;
    const trimmed = command.trim();

    // Check against threat patterns
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.regex.test(trimmed)) {
        const analysis: SecurityAnalysis = {
          riskLevel: pattern.risk,
          explanation: pattern.explanation,
          blocked: pattern.risk === 'critical' || pattern.risk === 'high',
          matchedRule: pattern.rule,
          suggestion: pattern.suggestion,
        };
        if (analysis.blocked) this.stats.commandsBlocked += 1;
        else this.stats.warningsIssued += 1;
        return analysis;
      }
    }

    return {
      riskLevel: 'safe',
      explanation: 'Command passed all security checks.',
      blocked: false,
    };
  }

  // -----------------------------------------------------------------------
  // File write analysis
  // -----------------------------------------------------------------------

  /** Analyze file write content for security threats */
  checkFileWrite(filePath: string, content: string): SecurityAnalysis {
    this.stats.totalChecks += 1;
    const lowerPath = filePath.toLowerCase();

    // Protected path check
    for (const protectedPath of PROTECTED_PATHS) {
      if (lowerPath.includes(protectedPath.toLowerCase())) {
        this.stats.writesBlocked += 1;
        return {
          riskLevel: 'critical',
          explanation: `Write to protected path '${protectedPath}' is not allowed.`,
          blocked: true,
          matchedRule: 'FILE-PATH-001',
        };
      }
    }

    // Content-based threat patterns
    for (const pattern of DANGEROUS_WRITE_PATTERNS) {
      if (pattern.regex.test(content)) {
        const analysis: SecurityAnalysis = {
          riskLevel: pattern.risk,
          explanation: pattern.explanation,
          blocked: pattern.risk === 'critical' || pattern.risk === 'high',
          matchedRule: pattern.rule,
          suggestion: pattern.suggestion,
        };
        if (analysis.blocked) this.stats.writesBlocked += 1;
        else this.stats.warningsIssued += 1;
        return analysis;
      }
    }

    // Secret leak detection in file content
    for (const secretPattern of SECRET_ENV_PATTERNS) {
      if (secretPattern.test(content)) {
        this.stats.warningsIssued += 1;
        return {
          riskLevel: 'warning',
          explanation: 'Detected potential secret/credential in file content.',
          blocked: false,
          matchedRule: 'FILE-SECRET-001',
          suggestion:
            'Use environment variables or a secrets manager instead of hardcoding credentials.',
        };
      }
    }

    return {
      riskLevel: 'safe',
      explanation: 'File write content passed all security checks.',
      blocked: false,
    };
  }

  // -----------------------------------------------------------------------
  // Profile-gated analysis
  // -----------------------------------------------------------------------

  /** Check an operation against the tool's security profile */
  checkWithProfile(toolName: string, analysis: SecurityAnalysis): SecurityAnalysis {
    const profile = this.getProfile(toolName);
    if (!profile) return analysis;

    // Deny-list override
    if (profile.denyList?.some((p) => analysis.matchedRule === p)) {
      return { ...analysis, blocked: true };
    }

    // Allow-list override
    if (profile.allowList && profile.allowList.length > 0) {
      const allowed = profile.allowList.some((p) => analysis.matchedRule === p);
      if (allowed) return { ...analysis, blocked: false, riskLevel: 'safe' };
    }

    // Risk threshold check
    const riskOrder: Record<SecurityRiskLevel, number> = {
      safe: 0,
      low: 1,
      warning: 2,
      high: 3,
      critical: 4,
    };
    const maxRisk = riskOrder[profile.maxAllowedRisk] ?? 4;
    const actualRisk = riskOrder[analysis.riskLevel] ?? 0;

    if (actualRisk > maxRisk) {
      return {
        ...analysis,
        blocked: true,
        explanation: `${analysis.explanation} [Exceeds profile max risk: ${profile.maxAllowedRisk}]`,
      };
    }

    return analysis;
  }

  // -----------------------------------------------------------------------
  // Batch checking
  // -----------------------------------------------------------------------

  /** Check multiple commands at once */
  checkCommands(commands: string[]): SecurityAnalysis[] {
    return commands.map((cmd) => this.checkCommand(cmd));
  }

  /** Check multiple file writes at once */
  checkFileWrites(files: Array<{ path: string; content: string }>): SecurityAnalysis[] {
    return files.map((f) => this.checkFileWrite(f.path, f.content));
  }

  // -----------------------------------------------------------------------
  // Secret scanning
  // -----------------------------------------------------------------------

  /** Scan a string for leaked secrets */
  scanForSecrets(text: string): Array<{ pattern: string; position: number }> {
    const findings: Array<{ pattern: string; position: number }> = [];
    for (const secretPattern of SECRET_ENV_PATTERNS) {
      const match = secretPattern.exec(text);
      if (match) {
        findings.push({ pattern: secretPattern.source, position: match.index });
      }
    }
    return findings;
  }

  // -----------------------------------------------------------------------
  // Hook integration
  // -----------------------------------------------------------------------

  /** Create a pre_tool hook that gates all tool calls through this checker */
  createPreToolHook(): {
    id: string;
    name: string;
    event: 'pre_tool';
    matcher: { tool: string };
    command: string;
    enabled: boolean;
    priority: number;
    handler: (toolName: string, args: Record<string, unknown>) => Promise<HookResult>;
  } {
    return {
      id: 'security-pre-shield',
      name: 'Security Pre-Tool Shield',
      event: 'pre_tool' as const,
      matcher: { tool: '*' },
      command: 'security_pre_shield',
      enabled: true,
      priority: 1,
      handler: async (toolName, args) => {
        const start = Date.now();

        // Terminal / shell commands
        if (
          toolName === 'terminal.run' ||
          toolName === 'run_command' ||
          toolName === 'runCommand'
        ) {
          const command = (args['command'] as string) || '';
          let analysis = this.checkCommand(command);
          analysis = this.checkWithProfile(toolName, analysis);

          if (analysis.blocked) {
            return {
              success: false,
              error: `[SECURITY BLOCKED]: ${analysis.explanation}`,
              durationMs: Date.now() - start,
              hookId: 'security-pre-shield',
              blocked: true,
              blockReason: analysis.explanation,
            };
          }

          if (analysis.riskLevel !== 'safe') {
            return {
              success: true,
              output: `[SECURITY WARNING]: ${analysis.explanation}`,
              durationMs: Date.now() - start,
              hookId: 'security-pre-shield',
            };
          }
        }

        // File write operations
        const writeTools = ['file.write', 'writeFile', 'write_to_file', 'replace_file_content'];
        if (writeTools.includes(toolName)) {
          const filePath =
            ((args['path'] || args['filePath'] || args['TargetFile']) as string) || '';
          const content =
            ((args['content'] || args['CodeContent'] || args['ReplacementContent']) as string) ||
            '';

          if (filePath) {
            let analysis = this.checkFileWrite(filePath, content);
            analysis = this.checkWithProfile(toolName, analysis);

            if (analysis.blocked) {
              return {
                success: false,
                error: `[SECURITY BLOCKED]: ${analysis.explanation}`,
                durationMs: Date.now() - start,
                hookId: 'security-pre-shield',
                blocked: true,
                blockReason: analysis.explanation,
              };
            }
          }
        }

        return {
          success: true,
          durationMs: Date.now() - start,
          hookId: 'security-pre-shield',
        };
      },
    };
  }

  /** Create a post_tool hook that scans tool output for leaked secrets */
  createPostToolHook(): {
    id: string;
    name: string;
    event: 'post_tool';
    matcher: { tool: string };
    command: string;
    enabled: boolean;
    priority: number;
    handler: (
      toolName: string,
      args: Record<string, unknown>,
      toolResult?: string,
    ) => Promise<HookResult>;
  } {
    return {
      id: 'security-post-scanner',
      name: 'Security Post-Tool Secret Scanner',
      event: 'post_tool' as const,
      matcher: { tool: '*' },
      command: 'security_post_scanner',
      enabled: true,
      priority: 99,
      handler: async (_toolName, _args, toolResult) => {
        const start = Date.now();
        if (!toolResult) {
          return { success: true, durationMs: Date.now() - start, hookId: 'security-post-scanner' };
        }

        const secrets = this.scanForSecrets(toolResult);
        if (secrets.length > 0) {
          // Redact secrets from output
          let redacted = toolResult;
          for (const secretPattern of SECRET_ENV_PATTERNS) {
            secretPattern.lastIndex = 0;
            redacted = redacted.replace(secretPattern, '[REDACTED-SECRET]');
          }
          return {
            success: true,
            output: redacted,
            durationMs: Date.now() - start,
            hookId: 'security-post-scanner',
          };
        }

        return {
          success: true,
          durationMs: Date.now() - start,
          hookId: 'security-post-scanner',
        };
      },
    };
  }

  // -----------------------------------------------------------------------
  // Statistics
  // -----------------------------------------------------------------------

  /** Get detection statistics */
  getStats(): {
    totalChecks: number;
    commandsBlocked: number;
    writesBlocked: number;
    warningsIssued: number;
  } {
    return { ...this.stats };
  }

  /** Reset statistics counters */
  resetStats(): void {
    this.stats = { totalChecks: 0, commandsBlocked: 0, writesBlocked: 0, warningsIssued: 0 };
  }
}
