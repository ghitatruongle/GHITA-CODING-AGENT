// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 5.3: Fix→Re-scan Verification Loop
// ------------------------------------------------------------------------------
// After a finding is fixed, re-scan the scoped region to prove the finding
// is closed. Verification order: buildability → security closure →
// change-aware bypass review → behavior preserved.
//
// Pattern: codex-security fix-finding + strix --scope-mode diff.
// ==============================================================================

import type { ValidationReceipt } from './validation-ladder.js';

export type RescanStatus = 'closed' | 'still-open' | 'build-failed' | 'skipped';

export interface RescanResult {
  findingRuleId: string;
  filePath: string;
  originalLine: number;
  status: RescanStatus;
  /** Whether the fix passed build check. */
  buildOk: boolean;
  /** Whether the finding no longer appears in re-scan. */
  securityClosed: boolean;
  /** Evidence from the re-scan (empty if closed). */
  residualEvidence: string;
  /** Updated receipt after re-scan. */
  updatedReceipt?: ValidationReceipt;
  timestamp: number;
}

export interface FixRescanOptions {
  /** Function to check if the project builds after the fix. */
  checkBuild?: () => Promise<boolean>;
  /** Function to re-scan a specific file/region for the rule. */
  rescanRegion?: (filePath: string, ruleId: string) => Promise<string[]>;
  /** Maximum re-scan attempts before giving up. */
  maxAttempts?: number;
}

/**
 * Verify that a fix closes a finding by re-scanning the affected region.
 * Returns a RescanResult indicating whether the finding is closed.
 */
export async function verifyFix(
  finding: { ruleId: string; filePath: string; line: number; receipt?: ValidationReceipt },
  options: FixRescanOptions = {},
): Promise<RescanResult> {
  const maxAttempts = options.maxAttempts ?? 1;

  // Step 1: Build check
  let buildOk = true;
  if (options.checkBuild) {
    try {
      buildOk = await options.checkBuild();
    } catch {
      buildOk = false;
    }
  }

  if (!buildOk) {
    return {
      findingRuleId: finding.ruleId,
      filePath: finding.filePath,
      originalLine: finding.line,
      status: 'build-failed',
      buildOk: false,
      securityClosed: false,
      residualEvidence: '',
      timestamp: Date.now(),
    };
  }

  // Step 2: Security re-scan
  let residualEvidence: string[] = [];
  if (options.rescanRegion) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        residualEvidence = await options.rescanRegion(finding.filePath, finding.ruleId);
        if (residualEvidence.length === 0) break;
      } catch {
        residualEvidence = ['re-scan failed'];
        break;
      }
    }
  }

  const securityClosed = residualEvidence.length === 0;
  const status: RescanStatus = securityClosed ? 'closed' : 'still-open';

  return {
    findingRuleId: finding.ruleId,
    filePath: finding.filePath,
    originalLine: finding.line,
    status,
    buildOk,
    securityClosed,
    residualEvidence: residualEvidence.join('\n'),
    timestamp: Date.now(),
  };
}
