// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 5.2: SARIF Output + Safe Fence
// ------------------------------------------------------------------------------
// SARIF 2.1.0 output with partialFingerprints and class-hash for sticky
// findings (dismiss once, never reappear). Plus safe_fence utility for
// rendering markdown containing LLM/attacker-controlled content without
// fence escape injection.
//
// Pattern: strix sarif.py + writer.py, codex-security schemas.
// ==============================================================================

import type { ValidationReceipt } from './validation-ladder.js';

// ---------------------------------------------------------------------------
// SARIF 2.1.0 Types (subset)
// ---------------------------------------------------------------------------

export interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

export interface SarifRun {
  tool: { driver: { name: string; version: string; rules?: SarifRule[] } };
  results: SarifResult[];
  invocations?: Array<{ executionSuccessful: boolean; endTimeUtc?: string }>;
}

export interface SarifRule {
  id: string;
  shortDescription?: { text: string };
  defaultConfiguration?: { level: 'error' | 'warning' | 'note' | 'none' };
}

export interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note' | 'none';
  message: { text: string };
  locations?: Array<{
    physicalLocation?: { artifactLocation?: { uri: string }; region?: { startLine: number } };
  }>;
  /** Sticky fingerprint: survives code movement within same class. */
  partialFingerprints?: Record<string, string>;
  /** Properties bag for extensions. */
  properties?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Class-hash: stable fingerprint across edits
// ---------------------------------------------------------------------------

/**
 * Compute a class-hash fingerprint for a finding. This hash is based on
 * the rule ID + surrounding code context (class/function scope), NOT the
 * exact line number, so it survives line shifts during refactoring.
 *
 * When a finding is dismissed by its class-hash, it won't reappear even
 * if the code moves to a different line.
 */
export function computeClassHash(ruleId: string, filePath: string, contextLines: string[]): string {
  const normalized = contextLines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('|');
  const raw = `${ruleId}:${filePath}:${normalized}`;
  return fnv1a32(raw);
}

/** FNV-1a 32-bit hash — fast, deterministic, no crypto dependency. */
function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// SARIF Builder
// ---------------------------------------------------------------------------

export interface SarifBuilderOptions {
  toolName?: string;
  toolVersion?: string;
}

export interface FindingForSarif {
  ruleId: string;
  filePath: string;
  line: number;
  evidence: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  receipt?: ValidationReceipt;
  /** Context lines around the finding for class-hash computation. */
  contextLines?: string[];
}

const SEVERITY_TO_LEVEL: Record<string, 'error' | 'warning' | 'note'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

export function buildSarifLog(
  findings: FindingForSarif[],
  options: SarifBuilderOptions = {},
): SarifLog {
  const toolName = options.toolName ?? 'ghita-secscan';
  const toolVersion = options.toolVersion ?? '1.1.5-beta1';

  const rules = [...new Set(findings.map((f) => f.ruleId))].map((id) => ({
    id,
    shortDescription: { text: `Security finding: ${id}` },
  }));

  const results: SarifResult[] = findings.map((f) => {
    const classHash = f.contextLines
      ? computeClassHash(f.ruleId, f.filePath, f.contextLines)
      : computeClassHash(f.ruleId, f.filePath, [f.evidence]);

    return {
      ruleId: f.ruleId,
      level: SEVERITY_TO_LEVEL[f.severity] ?? 'warning',
      message: { text: f.evidence },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: f.filePath },
            region: { startLine: f.line },
          },
        },
      ],
      partialFingerprints: {
        classHash,
        ruleAndPath: fnv1a32(`${f.ruleId}:${f.filePath}`),
      },
      properties: f.receipt
        ? {
            validationMethod: f.receipt.method,
            disposition: f.receipt.disposition,
            proofGaps: f.receipt.proofGaps,
            survivesRescan: f.receipt.survivesRescan,
          }
        : undefined,
    };
  });

  return {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: toolName, version: toolVersion, rules } },
        results,
        invocations: [{ executionSuccessful: true, endTimeUtc: new Date().toISOString() }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Safe Fence: prevent markdown injection from untrusted content
// ---------------------------------------------------------------------------

/**
 * Wraps untrusted content in a fenced code block that cannot be escaped
 * by the content itself. Handles content containing backtick sequences
 * by using a longer fence and escaping internal fence-like patterns.
 *
 * Pattern: strix writer.py safe_fence.
 */
export function safeFence(content: string, language = ''): string {
  // Find the longest backtick sequence in the content
  let maxBackticks = 0;
  const backtickRuns = content.match(/`+/g);
  if (backtickRuns) {
    for (const run of backtickRuns) {
      if (run.length > maxBackticks) maxBackticks = run.length;
    }
  }

  // Use at least 3 backticks, and more than any sequence in the content
  const fenceLen = Math.max(3, maxBackticks + 1);
  const fence = '`'.repeat(fenceLen);

  // Escape any internal sequences that match our fence length
  const escaped = content.replace(
    new RegExp(`\`${'{'.repeat(fenceLen)}}`, 'g'),
    `\u200B${'$&'.replace(/`/g, '\\`')}`,
  );

  return `${fence}${language}\n${escaped}\n${fence}`;
}

/**
 * Render a finding as safe markdown for display in chat/reports.
 * All attacker-controlled fields are fenced.
 */
export function renderFindingMarkdown(finding: FindingForSarif): string {
  const lines = [
    `### Finding: \`${finding.ruleId}\``,
    '',
    `**File:** \`${finding.filePath}\` **Line:** ${finding.line}`,
    `**Severity:** ${finding.severity}`,
    '',
    '**Evidence:**',
    safeFence(finding.evidence),
  ];

  if (finding.receipt) {
    lines.push('', `**Validation:** ${finding.receipt.method} → ${finding.receipt.disposition}`);
    if (finding.receipt.proofGaps.length > 0) {
      lines.push(`**Proof gaps:** ${finding.receipt.proofGaps.join('; ')}`);
    }
  } else {
    lines.push('', '⚠️ **Unvalidated** — not included in primary report.');
  }

  return lines.join('\n');
}
