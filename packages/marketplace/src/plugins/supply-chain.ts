// ==============================================================================
// GHITA CODING AGENT - Marketplace v1.1.0 Track 3 P42: supply-chain scan
// ==============================================================================
// Scans a plugin directory before it enters the catalog: computes a content
// hash, optionally queries an external hash database (VirusTotal-style), and
// runs local heuristics. Produces a severity report.
// ==============================================================================

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export type ScanVerdict = 'clean' | 'suspicious' | 'malicious' | 'unknown';

export interface ScanFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  label: string;
  path?: string;
}

export interface PluginScanReport {
  pluginId: string;
  dir: string;
  hash: string;
  verdict: ScanVerdict;
  findings: ScanFinding[];
  scannedAt: string;
  files: number;
}

export interface HashLookup {
  (hash: string, pluginId: string): Promise<ScanVerdict | undefined>;
}

/** Compute the SHA-256 content hash of a plugin directory (stable order). */
export function computePluginHash(dir: string): { hash: string; files: number } {
  const files: string[] = [];
  const walk = (base: string): void => {
    for (const name of readdirSync(base)) {
      if (name === '.git' || name === 'node_modules') continue;
      const full = join(base, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        files.push(relative(dir, full));
      }
    }
  };
  walk(dir);
  files.sort();
  const hash = createHash('sha256');
  for (const rel of files) {
    hash.update(rel);
    hash.update('\0');
    const content = readFileSync(join(dir, rel));
    hash.update(String(content.length));
    hash.update('\0');
    hash.update(content);
  }
  return { hash: hash.digest('hex'), files: files.length };
}

const HEURISTIC_RULES: Array<{
  severity: ScanFinding['severity'];
  label: string;
  test: (rel: string, content: string) => boolean;
}> = [
  {
    severity: 'high',
    label: 'obfuscated/encoded payload detected',
    test: (_rel, content) =>
      /eval\(|Function\(["']|atob\(|base64_decode\(/.test(content) && content.length > 2000,
  },
  {
    severity: 'critical',
    label: 'credential exfiltration pattern',
    test: (_rel, content) =>
      /https?:\/\/[^\s"']*(webhook|callback|telegram|discord)[^\s"']*/i.test(content) &&
      /(api[-_]?key|token|secret|password)\s*[:=]/i.test(content),
  },
  {
    severity: 'medium',
    label: 'downloads and executes remote content',
    test: (_rel, content) =>
      /(curl|wget|Invoke-WebRequest|fetch)\s*\(?["'][^"']*["']/i.test(content) &&
      /\|?\s*(sh|bash|powershell|node)\b/i.test(content),
  },
];

/** Local heuristic scan (no network required). */
export function heuristicScan(dir: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const walk = (base: string): void => {
    for (const name of readdirSync(base)) {
      if (name === '.git' || name === 'node_modules') continue;
      const full = join(base, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        const rel = relative(dir, full);
        if (!/\.(js|mjs|ts|py|sh|ps1)$/i.test(rel)) continue;
        const content = readFileSync(full, 'utf-8');
        for (const rule of HEURISTIC_RULES) {
          if (rule.test(rel, content)) {
            findings.push({ severity: rule.severity, label: rule.label, path: rel });
          }
        }
      }
    }
  };
  walk(dir);
  return findings;
}

/**
 * Full scan pipeline: hash → external lookup (optional) → heuristics → verdict.
 */
export async function scanPlugin(
  dir: string,
  pluginId: string,
  options: { lookupHash?: HashLookup; env?: Record<string, string> } = {},
): Promise<PluginScanReport> {
  const { hash, files } = computePluginHash(dir);
  const findings = heuristicScan(dir);
  const env = options.env ?? ({} as Record<string, string>);

  let verdict: ScanVerdict = 'unknown';
  if (options.lookupHash) {
    const external = await options.lookupHash(hash, pluginId);
    if (external) verdict = external;
  } else if (env.VT_API_KEY) {
    // Placeholder for a VirusTotal-style API call; tests inject lookupHash.
    verdict = 'unknown';
  }

  const critical = findings.some((f) => f.severity === 'critical');
  const high = findings.some((f) => f.severity === 'high');
  if (critical) verdict = 'malicious';
  else if (high)
    verdict = verdict === 'clean' ? 'suspicious' : verdict === 'unknown' ? 'suspicious' : verdict;

  return {
    pluginId,
    dir,
    hash,
    verdict,
    findings,
    scannedAt: new Date().toISOString(),
    files,
  };
}

/** Human-readable summary of a scan report. */
export function renderScanReport(report: PluginScanReport): string {
  const lines: string[] = [];
  lines.push(`# Supply-chain scan — ${report.pluginId}`);
  lines.push('');
  lines.push(
    `- **Verdict:** ${report.verdict} · **Files:** ${report.files} · **Hash:** ${report.hash.slice(0, 16)}…`,
  );
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('No findings.');
    return lines.join('\n');
  }
  lines.push('| Severity | Finding | Path |');
  lines.push('|---|---|---|');
  for (const f of report.findings) {
    lines.push(`| ${f.severity} | ${f.label} | ${f.path ?? '—'} |`);
  }
  return lines.join('\n');
}
