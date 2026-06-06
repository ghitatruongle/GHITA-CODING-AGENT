// ==============================================================================
// Phase 34: Input Sanitizer — XSS, SQL injection, command injection
// ==============================================================================

import type { SecurityIssue, SanitizationRule } from './types.js';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * InputSanitizer — detect & sanitize các loại injection.
 *
 * Sử dụng:
 *   const sanitizer = new InputSanitizer();
 *   const result = sanitizer.scan(userInput, 'comment');
 *   if (result.issues.length > 0) console.warn('Suspicious input:', result.issues);
 *   const clean = sanitizer.escapeHtml(userInput);
 */
export class InputSanitizer {
  private readonly customRules: SanitizationRule[] = [];
  private totalScans = 0;
  private totalIssuesFound = 0;

  constructor() {
    // Default rules
    this.customRules.push(...DEFAULT_RULES);
  }

  /**
   * Thêm rule tuỳ chỉnh.
   */
  addRule(rule: SanitizationRule): void {
    this.customRules.push(rule);
  }

  /**
   * Quét input cho tất cả rule, trả về issues phát hiện được.
   */
  scan(input: string, location: string): { issues: SecurityIssue[]; cleaned: string } {
    this.totalScans++;
    const issues: SecurityIssue[] = [];
    let cleaned = input;

    for (const rule of this.customRules) {
      if (rule.pattern.test(input)) {
        issues.push({
          id: `SEC-${rule.category.toUpperCase()}-${rule.id}`,
          category: rule.category,
          severity: rule.severity,
          title: rule.name,
          description: `Detected potential ${rule.category} pattern in input`,
          location,
          evidence: this.snippet(input, rule.pattern),
          remediation: `Apply rule.fix() or use escapeHtml/escapeSql to sanitize.`,
          cwe: CWE_MAP[rule.category],
          detectedAt: Date.now(),
        });
        if (rule.fix) cleaned = rule.fix(cleaned);
      }
    }

    this.totalIssuesFound += issues.length;
    return { issues, cleaned };
  }

  /**
   * Escape HTML entities.
   */
  escapeHtml(input: string): string {
    return input.replace(/[&<>"'`=/]/g, (c) => HTML_ESCAPES[c] ?? c);
  }

  /**
   * Strip toàn bộ HTML tags.
   */
  stripHtml(input: string): string {
    return input.replace(/<[^>]*>/g, '');
  }

  /**
   * Escape SQL string (wrap quote + escape internal quote).
   */
  escapeSql(input: string): string {
    return input.replace(/'/g, "''");
  }

  /**
   * Escape shell argument.
   */
  escapeShell(input: string): string {
    return `'${input.replace(/'/g, `'\\''`)}'`;
  }

  /**
   * Sanitize filename — chặn path traversal.
   */
  sanitizeFilename(input: string): string {
    return input
      .replace(/\.\.[/\\]/g, '')
      .replace(/[/\\]/g, '_')
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"|?*\x00-\x1f]/g, '')
      .replace(/^\.+/, '');
  }

  /**
   * Validate URL — chặn SSRF.
   */
  isSafeUrl(url: string, allowedProtocols: string[] = ['https:']): boolean {
    try {
      const u = new URL(url);
      if (!allowedProtocols.includes(u.protocol)) return false;
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0' || u.hostname === '::1') {
        return false;
      }
      if (u.hostname.startsWith('10.') || u.hostname.startsWith('192.168.') || u.hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stats.
   */
  stats(): { totalScans: number; totalIssuesFound: number; rulesCount: number } {
    return {
      totalScans: this.totalScans,
      totalIssuesFound: this.totalIssuesFound,
      rulesCount: this.customRules.length,
    };
  }

  private snippet(input: string, pattern: RegExp, ctx = 30): string {
    const m = input.match(pattern);
    if (!m || m.index === undefined) return input.slice(0, 100);
    const start = Math.max(0, m.index - ctx);
    const end = Math.min(input.length, m.index + m[0].length + ctx);
    return `...${input.slice(start, end)}...`;
  }
}

const CWE_MAP: Record<string, string> = {
  xss: 'CWE-79',
  'sql-injection': 'CWE-89',
  'command-injection': 'CWE-78',
  'path-traversal': 'CWE-22',
  csrf: 'CWE-352',
  'open-redirect': 'CWE-601',
  ssrf: 'CWE-918',
  'input-validation': 'CWE-20',
  cors: 'CWE-942',
  'api-key': 'CWE-798',
};

const DEFAULT_RULES: SanitizationRule[] = [
  {
    id: '001',
    name: 'Script tag injection',
    pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
    severity: 'critical',
    category: 'xss',
    fix: (s) => s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''),
  },
  {
    id: '002',
    name: 'Event handler attribute',
    pattern: /\bon\w+\s*=\s*["']?[^"'>\s]+/i,
    severity: 'high',
    category: 'xss',
    fix: (s) => s.replace(/\bon\w+\s*=\s*["']?[^"'>\s]+/gi, ''),
  },
  {
    id: '003',
    name: 'javascript: protocol',
    pattern: /javascript\s*:/i,
    severity: 'high',
    category: 'xss',
  },
  {
    id: '004',
    name: 'iframe injection',
    pattern: /<iframe\b/i,
    severity: 'high',
    category: 'xss',
    fix: (s) => s.replace(/<iframe\b[^>]*>.*?<\/iframe>/gi, ''),
  },
  {
    id: '005',
    name: 'SQL UNION injection',
    pattern: /\bunion\b[\s\S]+\bselect\b/i,
    severity: 'critical',
    category: 'sql-injection',
  },
  {
    id: '006',
    name: 'SQL comment injection',
    pattern: /(--\s|;--|\/\*)/,
    severity: 'high',
    category: 'sql-injection',
  },
  {
    id: '007',
    name: 'SQL tautology (1=1)',
    pattern: /\b(or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,
    severity: 'critical',
    category: 'sql-injection',
  },
  {
    id: '008',
    name: 'Shell command injection',
    pattern: /[;&|`$]\s*(rm|cat|ls|wget|curl|nc|bash|sh)\b/i,
    severity: 'critical',
    category: 'command-injection',
  },
  {
    id: '009',
    name: 'Path traversal',
    pattern: /\.\.[/\\]/,
    severity: 'high',
    category: 'path-traversal',
  },
  {
    id: '010',
    name: 'Eval / Function constructor',
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(/i,
    severity: 'critical',
    category: 'command-injection',
  },
];
