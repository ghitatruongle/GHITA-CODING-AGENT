export interface TaxonomyEntry {
  value: string;
  description: string;
  category?: string;
}

export class InstinctRegistry {
  private readonly entries = new Map<string, TaxonomyEntry>();

  register(entry: TaxonomyEntry): void {
    this.entries.set(entry.value.toLowerCase(), entry);
  }

  registerMany(entries: TaxonomyEntry[]): void {
    for (const e of entries) this.register(e);
  }

  /** Suggest returns only values that exist in the registry. Unknown → drop. */
  suggest(query: string, limit = 5): TaxonomyEntry[] {
    const lower = query.toLowerCase();
    const results: TaxonomyEntry[] = [];
    for (const [key, entry] of this.entries) {
      if (key.includes(lower) || entry.description.toLowerCase().includes(lower)) {
        results.push(entry);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  has(value: string): boolean {
    return this.entries.has(value.toLowerCase());
  }

  get(value: string): TaxonomyEntry | undefined {
    return this.entries.get(value.toLowerCase());
  }

  size(): number {
    return this.entries.size;
  }

  /** Check for description overlap between entries (detect near-duplicates). */
  findOverlaps(threshold = 0.7): Array<[TaxonomyEntry, TaxonomyEntry, number]> {
    const all = [...this.entries.values()];
    const overlaps: Array<[TaxonomyEntry, TaxonomyEntry, number]> = [];
    for (let i = 0; i < all.length; i++) {
      const entryA = all[i];
      if (!entryA) continue;
      for (let j = i + 1; j < all.length; j++) {
        const entryB = all[j];
        if (!entryB) continue;
        const sim = jaccardSimilarity(entryA.description, entryB.description);
        if (sim >= threshold) {
          overlaps.push([entryA, entryB, sim]);
        }
      }
    }
    return overlaps;
  }
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ---------------------------------------------------------------------------
// T5.5: Terminal Command Scorer
// ---------------------------------------------------------------------------

export type RiskLevel = 'safe' | 'caution' | 'dangerous' | 'blocked';

export interface CommandScore {
  command: string;
  riskLevel: RiskLevel;
  score: number; // 0-100, higher = more dangerous
  reasons: string[];
  blocked: boolean;
}

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string; weight: number }> = [
  { pattern: /\brm\s+(-[a-zA-Z]*f|.*-rf)\b/, reason: 'recursive force delete', weight: 40 },
  { pattern: /\b(curl|wget)\s.*\|\s*(sh|bash|zsh)\b/, reason: 'pipe to shell', weight: 80 },
  { pattern: /\bdd\s+.*of=\/dev\//, reason: 'dd to device', weight: 45 },
  { pattern: /\bmkfs\b/, reason: 'filesystem format', weight: 50 },
  { pattern: /\bchmod\s+[0-7]*777\b/, reason: 'world-writable permissions', weight: 30 },
  { pattern: /\bsudo\b/, reason: 'privilege escalation', weight: 20 },
  { pattern: />\s*\/dev\/(sd[a-z]|nvme|hd[a-z])\b/, reason: 'write to block device', weight: 50 },
  { pattern: /\beval\s*\(/, reason: 'dynamic code evaluation', weight: 35 },
  { pattern: /\bgit\s+push\s+.*--force\b/, reason: 'force push (destructive)', weight: 30 },
  { pattern: /\bDROP\s+(TABLE|DATABASE)\b/i, reason: 'destructive SQL', weight: 45 },
  { pattern: /\bnc\s+-[a-zA-Z]*l/, reason: 'netcat listener (potential backdoor)', weight: 40 },
  { pattern: /\benv\s+-i\b/, reason: 'cleared environment execution', weight: 15 },
];

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;?\s*:/, reason: 'fork bomb' },
  { pattern: /\brm\s+-rf\s+\/\s*$/, reason: 'delete root filesystem' },
];

export function scoreCommand(command: string): CommandScore {
  const reasons: string[] = [];
  let score = 0;

  // Check blocked patterns first
  for (const bp of BLOCKED_PATTERNS) {
    if (bp.pattern.test(command)) {
      return {
        command,
        riskLevel: 'blocked',
        score: 100,
        reasons: [bp.reason],
        blocked: true,
      };
    }
  }

  // Score dangerous patterns
  for (const dp of DANGEROUS_PATTERNS) {
    if (dp.pattern.test(command)) {
      score += dp.weight;
      reasons.push(dp.reason);
    }
  }

  score = Math.min(100, score);

  let riskLevel: RiskLevel = 'safe';
  if (score >= 70) riskLevel = 'dangerous';
  else if (score >= 40) riskLevel = 'caution';

  return { command, riskLevel, score, reasons, blocked: false };
}

/**
 * Check if a command should be blocked based on scoring.
 * Integrates with 2-phase approval system.
 */
export function shouldBlockCommand(command: string, threshold = 70): boolean {
  const result = scoreCommand(command);
  return result.blocked || result.score >= threshold;
}

// ---------------------------------------------------------------------------
// T5.6: Canonical Scan Artifacts
// ---------------------------------------------------------------------------

export interface ScanManifest {
  schema: 'scan-manifest-v1';
  scanner: string;
  version: string;
  timestamp: string;
  targetPath: string;
  rulesApplied: string[];
  exclusions: string[];
  deferred: string[];
  complete: boolean;
  findingsFile: string;
  coverageFile: string;
}

export interface ScanFindingsArtifact {
  schema: 'scan-findings-v1';
  manifestHash: string;
  totalFindings: number;
  validated: number;
  unvalidated: number;
  suppressed: number;
  findings: Array<{
    ruleId: string;
    filePath: string;
    line: number;
    severity: string;
    evidence: string;
    validated: boolean;
    disposition: string;
  }>;
}

export interface ScanCoverageArtifact {
  schema: 'scan-coverage-v1';
  manifestHash: string;
  filesScanned: number;
  filesExcluded: number;
  filesDeferred: number;
  rulesCoverage: Record<string, { filesChecked: number; findingsCount: number }>;
  overallCoveragePercent: number;
  honestAssessment: string;
}

export function createScanManifest(options: {
  scanner: string;
  version: string;
  targetPath: string;
  rulesApplied: string[];
  exclusions?: string[];
  deferred?: string[];
  complete?: boolean;
}): ScanManifest {
  return {
    schema: 'scan-manifest-v1',
    scanner: options.scanner,
    version: options.version,
    timestamp: new Date().toISOString(),
    targetPath: options.targetPath,
    rulesApplied: options.rulesApplied,
    exclusions: options.exclusions ?? [],
    deferred: options.deferred ?? [],
    complete: options.complete ?? false,
    findingsFile: 'findings.json',
    coverageFile: 'coverage.json',
  };
}

/** Validate that a manifest conforms to the canonical schema. */
export function validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest is not an object'] };
  }
  const m = manifest as Record<string, unknown>;
  if (m.schema !== 'scan-manifest-v1') errors.push('missing or wrong schema');
  if (typeof m.scanner !== 'string') errors.push('scanner must be string');
  if (typeof m.version !== 'string') errors.push('version must be string');
  if (typeof m.timestamp !== 'string') errors.push('timestamp must be string');
  if (typeof m.targetPath !== 'string') errors.push('targetPath must be string');
  if (!Array.isArray(m.rulesApplied)) errors.push('rulesApplied must be array');
  if (typeof m.complete !== 'boolean') errors.push('complete must be boolean');
  return { valid: errors.length === 0, errors };
}
