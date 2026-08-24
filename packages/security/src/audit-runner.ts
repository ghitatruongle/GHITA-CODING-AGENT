import { InputSanitizer } from './input-sanitizer.js';
import { CorsAuditor } from './cors-auditor.js';
import { SecretRotator } from './secret-rotator.js';
import type { SecurityIssue, AuditReport, CorsConfig, SecuritySeverity } from './types.js';

export interface AuditRunOptions {
  
  threshold?: number;
  
  rotateKeys?: boolean;
  
  inputsToScan?: Array<{ value: string; location: string }>;
  
  corsConfigs?: Array<{ config: CorsConfig; location: string }>;
  /** Logger */
  logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
}

const SEVERITY_WEIGHT: Record<SecuritySeverity, number> = {
  info: 1,
  low: 3,
  medium: 8,
  high: 15,
  critical: 30,
};

/**

 *

 *   const runner = new AuditRunner();
 *   const report = await runner.run({
 *     threshold: 80,
 *     inputsToScan: [{ value: userInput, location: 'chat.userMessage' }],
 *     corsConfigs: [{ config: corsConfig, location: 'api.config.ts' }],
 *   });
 *   console.log(report.score, report.passed, report.issues.length);
 */
export class AuditRunner {
  private readonly sanitizer: InputSanitizer;
  private readonly corsAuditor: CorsAuditor;
  private readonly rotator: SecretRotator;
  private readonly onLog?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;

  constructor(
    rotator?: SecretRotator,
    options: {
      logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
    } = {},
  ) {
    this.sanitizer = new InputSanitizer();
    this.corsAuditor = new CorsAuditor();
    this.rotator = rotator ?? new SecretRotator();
    this.onLog = options.logger;
  }

  /**
   * Expose sub-modules.
   */
  getSanitizer(): InputSanitizer {
    return this.sanitizer;
  }
  getCorsAuditor(): CorsAuditor {
    return this.corsAuditor;
  }
  getRotator(): SecretRotator {
    return this.rotator;
  }

  async run(options: AuditRunOptions = {}): Promise<AuditReport> {
    const threshold = options.threshold ?? 80;
    const issues: SecurityIssue[] = [];
    const now = Date.now();
    const reportId = `audit_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // 1. Scan inputs
    if (options.inputsToScan) {
      for (const { value, location } of options.inputsToScan) {
        const result = this.sanitizer.scan(value, location);
        issues.push(...result.issues);
      }
    }

    // 2. Audit CORS configs
    if (options.corsConfigs) {
      issues.push(...this.corsAuditor.auditMany(options.corsConfigs));
    }

    if (options.rotateKeys) {
      try {
        await this.rotator.tick();
      } catch (err) {
        this.onLog?.(`[Audit] Key rotation failed: ${(err as Error).message}`, 'error');
      }
    }

    // 4. Check expired / due-for-rotation keys
    const expired = this.rotator.listExpired(now);
    for (const k of expired) {
      issues.push({
        id: `SEC-KEY-EXPIRED-${k.id}`,
        category: 'api-key',
        severity: 'high',
        title: `Expired API key: ${k.id}`,
        description: `API key for ${k.provider} has expired.`,
        location: `rotator.${k.id}`,
        evidence: `expiredAt=${k.expiresAt}`,
        remediation: 'Rotate the key immediately.',
        cwe: 'CWE-798',
        detectedAt: now,
      });
    }

    const due = this.rotator.listDueForRotation(now);
    for (const k of due) {
      issues.push({
        id: `SEC-KEY-ROTATE-${k.id}`,
        category: 'api-key',
        severity: 'medium',
        title: `API key due for rotation: ${k.id}`,
        description: `API key for ${k.provider} is older than ${k.rotationIntervalMs}ms.`,
        location: `rotator.${k.id}`,
        evidence: `createdAt=${k.createdAt}`,
        remediation: 'Rotate the key.',
        cwe: 'CWE-798',
        detectedAt: now,
      });
    }

    const counts: Record<SecuritySeverity, number> = {
      info: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    let penalty = 0;
    for (const i of issues) {
      counts[i.severity]++;
      penalty += SEVERITY_WEIGHT[i.severity];
    }
    const score = Math.max(0, 100 - penalty);

    return {
      id: reportId,
      runAt: now,
      issues,
      counts,
      score,
      passed: score >= threshold,
      threshold,
    };
  }
}
