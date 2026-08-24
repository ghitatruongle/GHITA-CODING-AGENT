// Implements OWASP Top 10 for LLM Applications guardrails & policy enforcement
// inspired by Microsoft Agent Governance Toolkit.

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CommandEvaluationResult {
  allowed: boolean;
  reason?: string;
  severity?: ThreatSeverity;
  matchedPattern?: string;
}

export interface PromptEvaluationResult {
  safe: boolean;
  detectedThreats: string[];
  severity?: ThreatSeverity;
}

const DESTRUCTIVE_COMMAND_PATTERNS: {
  pattern: RegExp;
  reason: string;
  severity: ThreatSeverity;
}[] = [
  {
    pattern: /\brm\s+-rf\s+[/~*]/i,
    reason: 'Destructive root or home directory deletion pattern detected',
    severity: 'critical',
  },
  { pattern: /\bformat\s+[a-z]:/i, reason: 'Disk format command detected', severity: 'critical' },
  {
    pattern: /\bdd\s+if=.*of=\/dev\/(sd|hd|nvme)/i,
    reason: 'Direct disk write command detected',
    severity: 'critical',
  },
  {
    pattern: /\b(mkfs|fdisk|parted)\b/i,
    reason: 'Disk partitioning/formatting tool execution',
    severity: 'critical',
  },
  { pattern: /:\(\)\{\s*:\|:&\s*\};:/, reason: 'Fork bomb attempt detected', severity: 'critical' },
  {
    pattern: /curl\s+.*\|\s*(bash|sh|zsh|powershell)/i,
    reason: 'Unverified remote script pipe execution',
    severity: 'high',
  },
  {
    pattern: /wget\s+.*\|\s*(bash|sh|zsh|powershell)/i,
    reason: 'Unverified remote script pipe execution',
    severity: 'high',
  },
  {
    pattern: /\bcat\s+~\/\.(ssh|aws|config\/gh|env)/i,
    reason: 'Potential secret exfiltration attempt',
    severity: 'high',
  },
  {
    pattern: /\b(nc|netcat|ncat)\s+-e\b/i,
    reason: 'Reverse shell creation attempt',
    severity: 'critical',
  },
  {
    pattern:
      /\$\(\s*[^)]*(curl|wget|iwr|invoke-webrequest|invoke-expression|iex)\b|`[^`]*(curl|wget)\b[^`]*`/i,
    reason: 'Command substitution fetching remote content',
    severity: 'critical',
  },
  {
    pattern:
      /\b(iex|invoke-expression)\s*\(?\s*(iwr|irm|invoke-restmethod|invoke-webrequest|new-object\s+system\.net)/i,
    reason: 'PowerShell download-and-execute attempt',
    severity: 'critical',
  },
  {
    pattern: /\b(base64|openssl)\b[^\n|]*\|\s*(bash|sh|zsh|powershell)\b/i,
    reason: 'Decoded payload piped into a shell',
    severity: 'critical',
  },
];

const PROMPT_INJECTION_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, name: 'System prompt override' },
  { pattern: /disregard\s+(above|prior)\s+rules/i, name: 'Rule evasion injection' },
  { pattern: /you\s+are\n+now\s+in\s+developer\s+mode/i, name: 'Jailbreak attempt' },
  {
    pattern: /print\s+your\s+(system\s+prompt|initial\s+instructions)/i,
    name: 'System prompt extraction',
  },
  { pattern: /<system_override>/i, name: 'Tag injection attempt' },
];

export class PolicyEnforcer {
  /**
   * Evaluate a terminal shell command against OWASP Top 10 AI Governance rules.
   */
  static evaluateCommand(command: string): CommandEvaluationResult {
    const trimmed = command.trim();
    if (!trimmed) {
      return { allowed: true };
    }

    // De-obfuscation passes so quote-splitting (c'u'rl), backslash escapes and
    // zero-width characters can no longer slip past the denylist.
    const variants = [
      trimmed,
      trimmed.replace(/['"`]/g, ''),
      trimmed.replace(/\\(.)/g, '$1').replace(/['"`]/g, ''),
      trimmed.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/['"`]/g, ''),
    ];

    for (const rule of DESTRUCTIVE_COMMAND_PATTERNS) {
      if (variants.some((v) => rule.pattern.test(v))) {
        return {
          allowed: false,
          reason: rule.reason,
          severity: rule.severity,
          matchedPattern: rule.pattern.source,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Evaluate prompt text or user input for prompt injection & jailbreak attempts.
   */
  static evaluateInput(input: string): PromptEvaluationResult {
    const threats: string[] = [];
    let highestSeverity: ThreatSeverity = 'low';

    for (const rule of PROMPT_INJECTION_PATTERNS) {
      if (rule.pattern.test(input)) {
        threats.push(rule.name);
        highestSeverity = 'high';
      }
    }

    return {
      safe: threats.length === 0,
      detectedThreats: threats,
      severity: threats.length > 0 ? highestSeverity : undefined,
    };
  }

  /**
   * Sanitize shell environment options to prevent credential leaks.
   */
  static sanitizeEnvKeys(env: Record<string, string | undefined>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveKeywords = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'AUTH', 'PRIVATE'];

    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) continue;
      const isSensitive = sensitiveKeywords.some((k) => key.toUpperCase().includes(k));
      sanitized[key] = isSensitive ? '[REDACTED_BY_GOVERNANCE_POLICY]' : value;
    }

    return sanitized;
  }
}
