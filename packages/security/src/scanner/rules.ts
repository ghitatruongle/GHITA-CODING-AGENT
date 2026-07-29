// ==============================================================================
// v0.4.9 A1: Security Scanner — Rule Set
//
// Local rule-based detection tuned for the GHITA monorepo tech stack
// (TS/JS, Rust, Kotlin, config). Rules are line-based regex checks.
// ==============================================================================

import type { ScannerRule } from './models.js';

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Bộ rule mặc định của scanner. Mỗi rule quét theo dòng — giữ đơn giản,
 * dễ kiểm chứng và không phụ thuộc parser.
 */
export const DEFAULT_SCANNER_RULES: ScannerRule[] = [
  // ── Secrets ────────────────────────────────────────────────────────────
  {
    id: 'GHITA-SEC-001',
    title: 'Hardcoded OpenAI/Anthropic API key',
    pattern: /\bsk-(?:proj-|org-|ant-)?[A-Za-z0-9_-]{20,}\b/,
    severity: 'critical',
    confidence: 'high',
    category: 'secrets',
    cwe: ['CWE-798'],
    remediation: 'Move the key to an environment variable or the OS keychain; rotate the exposed key immediately.',
    negativePattern: /(?:example|placeholder|your[-_]?key|xxx|\.test\.|fixture)/i,
  },
  {
    id: 'GHITA-SEC-002',
    title: 'Hardcoded AWS access key ID',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    severity: 'critical',
    confidence: 'high',
    category: 'secrets',
    cwe: ['CWE-798'],
    remediation: 'Remove the credential from source and rotate it in AWS IAM.',
  },
  {
    id: 'GHITA-SEC-003',
    title: 'Hardcoded GitHub token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    severity: 'critical',
    confidence: 'high',
    category: 'secrets',
    cwe: ['CWE-798'],
    remediation: 'Revoke the token on GitHub and load it from the environment instead.',
  },
  {
    id: 'GHITA-SEC-004',
    title: 'Private key material committed to source',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    severity: 'critical',
    confidence: 'high',
    category: 'secrets',
    cwe: ['CWE-321'],
    remediation: 'Remove the private key from the repository and rotate the key pair.',
  },
  {
    id: 'GHITA-SEC-005',
    title: 'Hardcoded password assignment',
    pattern: /\b(?:password|passwd|secret)\s*[:=]\s*['"][^'"]{6,}['"]/i,
    severity: 'high',
    confidence: 'medium',
    category: 'secrets',
    cwe: ['CWE-259'],
    remediation: 'Load secrets from environment variables or a secret manager.',
    negativePattern: /(?:process\.env|import\.meta\.env|例|placeholder|example|changeme-in-env|\.test\.|spec|fixture|\*{3,})/i,
  },

  // ── Injection ──────────────────────────────────────────────────────────
  {
    id: 'GHITA-SEC-010',
    title: 'eval() usage',
    pattern: /\beval\s*\(/,
    severity: 'high',
    confidence: 'medium',
    category: 'command-injection',
    cwe: ['CWE-95'],
    remediation: 'Replace eval() with safe parsing (JSON.parse, explicit dispatch tables).',
    fileExtensions: CODE_EXTENSIONS,
    negativePattern: /\/\/|\/\*|['"`].*\beval\s*\(.*['"`]/,
  },
  {
    id: 'GHITA-SEC-011',
    title: 'new Function() dynamic code construction',
    pattern: /\bnew\s+Function\s*\(/,
    severity: 'high',
    confidence: 'medium',
    category: 'command-injection',
    cwe: ['CWE-95'],
    remediation: 'Avoid constructing code from strings; use static functions.',
    fileExtensions: CODE_EXTENSIONS,
  },
  {
    id: 'GHITA-SEC-012',
    title: 'Shell execution with string concatenation/interpolation',
    pattern: /\b(?:exec|execSync)\s*\(\s*(?:[`][^`]*\$\{|['"][^'"]*['"]\s*\+)/,
    severity: 'high',
    confidence: 'medium',
    category: 'command-injection',
    cwe: ['CWE-78'],
    remediation: 'Use execFile/spawn with an argument array instead of interpolated shell strings.',
    fileExtensions: CODE_EXTENSIONS,
  },
  {
    id: 'GHITA-SEC-013',
    title: 'SQL query built via string concatenation',
    pattern: /\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^'"`]*['"`]\s*\+\s*|\$\{[^}]+\}[^'"`]*\b(?:FROM|WHERE|VALUES)\b/i,
    severity: 'high',
    confidence: 'low',
    category: 'sql-injection',
    cwe: ['CWE-89'],
    remediation: 'Use parameterized queries / prepared statements.',
    fileExtensions: CODE_EXTENSIONS,
  },

  // ── XSS / DOM ──────────────────────────────────────────────────────────
  {
    id: 'GHITA-SEC-020',
    title: 'dangerouslySetInnerHTML usage',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{/,
    severity: 'medium',
    confidence: 'high',
    category: 'xss',
    cwe: ['CWE-79'],
    remediation: 'Sanitize HTML (rehype-sanitize/DOMPurify) before injecting, or render as text.',
    fileExtensions: ['.tsx', '.jsx'],
  },
  {
    id: 'GHITA-SEC-021',
    title: 'innerHTML assignment',
    pattern: /\.innerHTML\s*=\s*(?!['"`]\s*['"`])/,
    severity: 'medium',
    confidence: 'medium',
    category: 'xss',
    cwe: ['CWE-79'],
    remediation: 'Prefer textContent, or sanitize the HTML before assignment.',
    fileExtensions: CODE_EXTENSIONS,
  },

  // ── Transport / crypto ─────────────────────────────────────────────────
  {
    id: 'GHITA-SEC-030',
    title: 'Insecure http:// endpoint in fetch/axios call',
    pattern: /\b(?:fetch|axios(?:\.\w+)?)\s*\(\s*['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.16\.)/,
    severity: 'medium',
    confidence: 'high',
    category: 'auth',
    cwe: ['CWE-319'],
    remediation: 'Use https:// for all non-loopback endpoints.',
    fileExtensions: CODE_EXTENSIONS,
  },
  {
    id: 'GHITA-SEC-031',
    title: 'Weak hash algorithm (md5/sha1) for security purposes',
    pattern: /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/,
    severity: 'medium',
    confidence: 'medium',
    category: 'auth',
    cwe: ['CWE-327'],
    remediation: 'Use sha256 or stronger for anything security-sensitive (cache keys are acceptable).',
    fileExtensions: CODE_EXTENSIONS,
  },
  {
    id: 'GHITA-SEC-032',
    title: 'TLS certificate validation disabled',
    pattern: /(?:rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0)/,
    severity: 'high',
    confidence: 'high',
    category: 'auth',
    cwe: ['CWE-295'],
    remediation: 'Never disable TLS verification outside of isolated tests.',
  },

  // ── Path traversal / filesystem ────────────────────────────────────────
  {
    id: 'GHITA-SEC-040',
    title: 'Path built directly from user input without normalization',
    pattern: /(?:readFile|writeFile|createReadStream|createWriteStream|unlink|rm)(?:Sync)?\s*\(\s*(?:req\.|params\.|query\.|body\.)/,
    severity: 'high',
    confidence: 'medium',
    category: 'path-traversal',
    cwe: ['CWE-22'],
    remediation: 'Resolve against a fixed root and verify the result stays within it before file access.',
    fileExtensions: CODE_EXTENSIONS,
  },
];
