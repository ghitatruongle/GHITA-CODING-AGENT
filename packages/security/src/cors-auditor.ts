import type { CorsConfig, SecurityIssue } from './types.js';

const DANGEROUS_METHODS = ['TRACE', 'CONNECT'];

/**

 *

 *   const auditor = new CorsAuditor();
 *   const issues = auditor.audit({
 *     origins: ['*'],
 *     methods: ['GET', 'POST', 'TRACE'],
 *     headers: ['*'],
 *     credentials: true,
 *   }, 'api.config.ts');
 */
export class CorsAuditor {
  
  audit(config: CorsConfig, location: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const now = Date.now();

    // Check 1: Wildcard origin with credentials = critical
    if (config.origins.includes('*') && config.credentials) {
      issues.push({
        id: 'SEC-CORS-001',
        category: 'cors',
        severity: 'critical',
        title: 'Wildcard origin with credentials',
        description:
          'Allowing credentials with `*` origin is forbidden by spec and creates CSRF risk.',
        location,
        evidence: 'origins=["*"], credentials=true',
        remediation: 'Replace "*" with explicit origin allowlist when credentials=true.',
        cwe: 'CWE-942',
        detectedAt: now,
      });
    }

    // Check 2: Wildcard origin alone = medium
    if (config.origins.includes('*')) {
      issues.push({
        id: 'SEC-CORS-002',
        category: 'cors',
        severity: 'medium',
        title: 'Wildcard origin allowed',
        description: '`Access-Control-Allow-Origin: *` allows any site to call your API.',
        location,
        evidence: 'origins=["*"]',
        remediation: 'Use explicit origin allowlist.',
        cwe: 'CWE-942',
        detectedAt: now,
      });
    }

    // Check 3: Wildcard headers
    if (config.headers.includes('*')) {
      issues.push({
        id: 'SEC-CORS-003',
        category: 'cors',
        severity: 'medium',
        title: 'Wildcard allowed headers',
        description: '`Access-Control-Allow-Headers: *` exposes all custom headers.',
        location,
        evidence: 'headers=["*"]',
        remediation: 'Specify explicit header allowlist.',
        cwe: 'CWE-942',
        detectedAt: now,
      });
    }

    // Check 4: Dangerous methods
    for (const m of config.methods) {
      if (DANGEROUS_METHODS.includes(m.toUpperCase())) {
        issues.push({
          id: 'SEC-CORS-004',
          category: 'cors',
          severity: 'high',
          title: `Dangerous method exposed: ${m}`,
          description: `Method ${m} should never be in CORS allowlist.`,
          location,
          evidence: `methods=[${config.methods.join(', ')}]`,
          remediation: `Remove ${m} from allowed methods.`,
          cwe: 'CWE-749',
          detectedAt: now,
        });
      }
    }

    // Check 5: Max age too long (>24h)
    if (config.maxAge !== undefined && config.maxAge > 86400) {
      issues.push({
        id: 'SEC-CORS-005',
        category: 'cors',
        severity: 'low',
        title: 'Long CORS preflight cache',
        description: `maxAge=${config.maxAge}s (>24h) makes policy changes slow to propagate.`,
        location,
        evidence: `maxAge=${config.maxAge}`,
        remediation: 'Lower maxAge to 600-3600s unless strictly required.',
        cwe: 'CWE-942',
        detectedAt: now,
      });
    }

    // Check 6: Null origin in allowlist
    if (config.origins.includes('null')) {
      issues.push({
        id: 'SEC-CORS-006',
        category: 'cors',
        severity: 'high',
        title: 'Null origin in allowlist',
        description: 'Allowing "null" origin can be exploited via sandboxed iframes/file:// URLs.',
        location,
        evidence: 'origins includes "null"',
        remediation: 'Remove "null" from origin allowlist.',
        cwe: 'CWE-942',
        detectedAt: now,
      });
    }

    // Check 7: Subdomain wildcard (e.g. *.example.com)
    for (const origin of config.origins) {
      if (origin.startsWith('*.')) {
        issues.push({
          id: 'SEC-CORS-007',
          category: 'cors',
          severity: 'medium',
          title: `Subdomain wildcard: ${origin}`,
          description:
            'Wildcard subdomain allows any subdomain (including attacker-controlled if subdomain takeover).',
          location,
          evidence: `origins includes "${origin}"`,
          remediation: 'List explicit subdomains.',
          cwe: 'CWE-942',
          detectedAt: now,
        });
      }
    }

    return issues;
  }

  auditMany(configs: Array<{ config: CorsConfig; location: string }>): SecurityIssue[] {
    return configs.flatMap((c) => this.audit(c.config, c.location));
  }
}
