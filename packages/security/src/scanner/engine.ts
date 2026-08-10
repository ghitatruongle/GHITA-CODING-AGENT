// ==============================================================================
// v0.4.9 A1: Security Scanner — Local Scan Engine
//
// A deterministic, fully-offline scanner: it walks a repository (skipping
// artifact/dependency dirs), applies the line-based rule set, and emits
// findings/coverage documents with a 0–100 score.
// ==============================================================================

import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { loadNative } from '@ghita/native-bridge';
import type {
  FindingSeverityLevel,
  ScanCoverageDocument,
  ScanFinding,
  ScanFindingsDocument,
  ScannerRule,
  ScanSummary,
} from './models.js';
import { DEFAULT_SCANNER_RULES } from './rules.js';

/** v1.1.0 Track 8 A7: native secscan addon surface (via @ghita/native-bridge). */
interface SecscanNative {
  scanFast(
    content: string,
    rules: Array<{ id: string; pattern: string; negative?: string }>,
  ): { lines: Uint32Array; ruleIndices: Uint32Array; evidence: string[] };
}

/** Thư mục luôn bị loại khỏi scan (artifact/dependency dirs). */
const DEFAULT_EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  '.git',
  '.turbo',
  '.next',
  'out',
]);

/** Chỉ quét file text có đuôi nằm trong danh sách này. */
const SCANNABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.rs',
  '.kt',
  '.java',
  '.py',
  '.go',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.env',
  '.sh',
  '.ps1',
  '.gradle',
  '.properties',
]);

const MAX_EVIDENCE_LENGTH = 200;

export interface ScannerOptions {
  /** Rule set tùy chỉnh (mặc định: DEFAULT_SCANNER_RULES). */
  rules?: ScannerRule[];
  /** Bỏ qua file lớn hơn ngưỡng này (mặc định 1 MiB). */
  maxFileSizeBytes?: number;
  /** Giới hạn số file quét (bảo hiểm cho repo lớn; mặc định 20 000). */
  maxFiles?: number;
  /** Tên thư mục loại trừ bổ sung. */
  excludeDirs?: string[];
}

export interface ScanOptions {
  /** 'repository' = quét toàn bộ root; hoặc danh sách path con. */
  target?: 'repository' | readonly string[];
  signal?: AbortSignal;
}

export interface ScanReport {
  findings: ScanFindingsDocument;
  coverage: ScanCoverageDocument;
  summary: ScanSummary;
}

export class InvalidScanTargetError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidScanTargetError';
  }
}

/**
 * SecurityScanner — quét mã nguồn local theo rule, trả về findings/coverage
 * documents theo cấu trúc SARIF-like tiện tiêu thụ downstream.
 *
 * Sử dụng:
 *   const scanner = new SecurityScanner();
 *   const report = await scanner.scan('/path/to/repo');
 *   console.log(report.summary.score, report.findings.findings.length);
 */
export class SecurityScanner {
  /** v1.1.0 Track 8 A7: ép dùng JS fast path (test parity / debug). */
  static forceJsScanFast = false;

  private readonly rules: ScannerRule[];
  private readonly maxFileSizeBytes: number;
  private readonly maxFiles: number;
  private readonly excludedDirs: Set<string>;

  constructor(options: ScannerOptions = {}) {
    this.rules = options.rules ?? DEFAULT_SCANNER_RULES;
    this.maxFileSizeBytes = options.maxFileSizeBytes ?? 1024 * 1024;
    this.maxFiles = options.maxFiles ?? 20_000;
    this.excludedDirs = new Set([...DEFAULT_EXCLUDED_DIRS, ...(options.excludeDirs ?? [])]);
  }

  /**
   * Quét repository hoặc danh sách path con.
   */
  async scan(repository: string, options: ScanOptions = {}): Promise<ScanReport> {
    const startedAt = Date.now();
    const scanId = randomUUID();
    const root = await this.normalizeRepository(repository, options.signal);
    const includePaths = await this.normalizeTargetPaths(
      root,
      options.target ?? 'repository',
      options.signal,
    );

    const files: string[] = [];
    let filesSkipped = 0;
    const roots = includePaths.length === 0 ? [root] : includePaths.map((p) => join(root, p));
    for (const scanRoot of roots) {
      const info = await stat(scanRoot);
      if (info.isFile()) {
        files.push(scanRoot);
        continue;
      }
      filesSkipped += await this.collectFiles(scanRoot, files, options.signal);
    }

    const truncated = files.length > this.maxFiles;
    const scanFiles = truncated ? files.slice(0, this.maxFiles) : files;

    const findings: ScanFinding[] = [];
    let bytesScanned = 0;
    let filesScanned = 0;
    for (const file of scanFiles) {
      throwIfAborted(options.signal);
      const info = await stat(file);
      if (info.size > this.maxFileSizeBytes) {
        filesSkipped++;
        continue;
      }
      const content = await readFile(file, 'utf8').catch(() => null);
      if (content === null) {
        filesSkipped++;
        continue;
      }
      bytesScanned += info.size;
      filesScanned++;
      const relPath = relative(root, file).split(sep).join('/');
      this.scanContent(relPath, content, findings);
    }

    const completedAt = Date.now();
    const counts = countBySeverity(findings);
    return {
      findings: {
        documentType: 'ghita-security.findings',
        schemaVersion: '1.0',
        scanId,
        findings,
      },
      coverage: {
        documentType: 'ghita-security.coverage',
        schemaVersion: '1.0',
        scanId,
        mode: includePaths.length === 0 ? 'repository' : 'scoped_path',
        completeness: truncated ? 'partial' : 'complete',
        includePaths: includePaths.length === 0 ? ['.'] : [...includePaths],
        excludePaths: [...this.excludedDirs],
        stats: {
          filesScanned,
          filesSkipped,
          bytesScanned,
        },
      },
      summary: {
        scanId,
        startedAt,
        completedAt,
        root,
        counts,
        score: computeScore(counts),
      },
    };
  }

  /**
   * Quét một chuỗi nội dung (dùng cho scan in-memory / test).
   */
  scanContent(relPath: string, content: string, sink?: ScanFinding[]): ScanFinding[] {
    const findings = sink ?? [];
    const ext = extname(relPath).toLowerCase();
    const applicable = this.rules.filter(
      (r) => !r.fileExtensions || r.fileExtensions.includes(ext),
    );
    if (applicable.length === 0) return findings;

    // v1.1.0 Track 8 A3: lazy line iteration — không dựng toàn bộ mảng dòng
    // (giảm RAM đáng kể trên file lớn; giữ nguyên ngữ nghĩa per-line/per-rule).
    let lineStart = 0;
    let lineNo = 1;
    while (lineStart <= content.length) {
      const nl = content.indexOf('\n', lineStart);
      const lineEnd = nl === -1 ? content.length : nl;
      const line = content.slice(lineStart, lineEnd);
      if (line.length > 2000) {
        // minified/generated line — skip
      } else {
        for (const rule of applicable) {
          if (!rule.pattern.test(line)) continue;
          if (rule.negativePattern?.test(line)) continue;
          this.pushFinding(findings, rule, relPath, line, lineNo);
        }
      }
      if (nl === -1) break;
      lineStart = nl + 1;
      lineNo += 1;
    }
    return findings;
  }

  /**
   * v1.1.0 Track 8 A3 (fast path): quét bằng MỘT alternation regex trên toàn
   * buffer (không tách dòng) — nhanh hơn đáng kể trên file lớn, vẫn giữ
   * ruleId + số dòng cho từng finding.
   */
  scanContentFast(relPath: string, content: string, sink?: ScanFinding[]): ScanFinding[] {
    const findings = sink ?? [];
    const ext = extname(relPath).toLowerCase();
    const applicable = this.rules.filter(
      (r) => !r.fileExtensions || r.fileExtensions.includes(ext),
    );
    if (applicable.length === 0) return findings;

    // v1.1.0 Track 8 A7: native fast path qua @ghita/native-bridge (secscan addon).
    if (!SecurityScanner.forceJsScanFast) {
      const bridge = loadNative<SecscanNative>('secscan', undefined as unknown as SecscanNative);
      if (bridge.native && typeof bridge.impl.scanFast === 'function') {
        const rules = applicable.map((r) => ({
          id: r.id,
          pattern: r.pattern.source,
          negative: r.negativePattern?.source,
        }));
        try {
          const result = bridge.impl.scanFast(content, rules);
          for (let i = 0; i < result.lines.length; i++) {
            const rule = applicable[result.ruleIndices[i] ?? 0];
            if (!rule) continue;
            this.pushFinding(
              findings,
              rule,
              relPath,
              result.evidence[i] ?? '',
              result.lines[i] ?? 0,
            );
          }
          return findings;
        } catch {
          // Native không hỗ trợ pattern (vd look-around) → fallback JS bên dưới.
        }
      }
    }

    const combined = new RegExp(`(?:${applicable.map((r) => r.pattern.source).join('|')})`, 'g');
    let match: RegExpExecArray | null;
    let lineNo = 1;
    let lastIndex = 0;
    while ((match = combined.exec(content)) !== null) {
      // Cập nhật số dòng theo số ký tự xuống dòng giữa match trước và match này.
      lineNo += countNewlines(content, lastIndex, match.index);
      lastIndex = match.index;
      const matchedText = match[0];
      const rule = applicable.find(
        (r) => r.pattern.test(matchedText) && !r.negativePattern?.test(matchedText),
      );
      if (!rule) continue;
      this.pushFinding(findings, rule, relPath, matchedText, lineNo);
      if (match.index === combined.lastIndex) combined.lastIndex++;
    }
    return findings;
  }

  private pushFinding(
    findings: ScanFinding[],
    rule: ScannerRule,
    relPath: string,
    matchedText: string,
    lineNo: number,
  ): void {
    const evidence = matchedText.trim().slice(0, MAX_EVIDENCE_LENGTH);
    findings.push({
      findingId: randomUUID(),
      ruleId: rule.id,
      title: rule.title,
      summary: `${rule.title} detected at ${relPath}:${lineNo}`,
      severity: { level: rule.severity },
      confidence: {
        level: rule.confidence,
        rationale: 'Line-based pattern match by the local rule engine.',
      },
      taxonomy: { category: rule.category, cwe: [...rule.cwe] },
      locations: [{ path: relPath, startLine: lineNo }],
      evidence,
      remediation: rule.remediation,
      fingerprints: {
        algorithm: 'ghita-scanner/v1',
        primary: fingerprint(rule.id, relPath, evidence),
      },
      provenance: { source: 'ghita-local-scanner' },
    });
  }

  // ── Scan-target resolution (path safety + containment) ──────────────────

  /**
   * Resolve the scan root to a canonical directory. Rejects anything that is
   * not an existing directory so the directory walk downstream is always safe.
   */
  private async normalizeRepository(repository: string, signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    const requested = resolve(expandTilde(repository));
    let canonical: string;
    try {
      canonical = await realpath(requested);
    } catch (error) {
      throw new InvalidScanTargetError(`Scan root does not exist: ${requested}`, { cause: error });
    }
    const info = await stat(canonical).catch(() => null);
    if (!info?.isDirectory()) {
      throw new InvalidScanTargetError(`Scan root is not a directory: ${canonical}`);
    }
    return canonical;
  }

  /**
   * Validate and canonicalize an explicit list of scoped paths. Every target
   * must exist and resolve to a location inside `root`; results are returned as
   * de-duplicated, POSIX-relative paths.
   */
  private async normalizeTargetPaths(
    root: string,
    target: 'repository' | readonly string[],
    signal?: AbortSignal,
  ): Promise<string[]> {
    if (target === 'repository') return [];
    if (!Array.isArray(target) || target.length === 0) {
      throw new InvalidScanTargetError('A scoped scan needs at least one path.');
    }

    const seen = new Set<string>();
    for (const raw of target) {
      throwIfAborted(signal);
      if (typeof raw !== 'string' || raw.trim().length === 0) {
        throw new InvalidScanTargetError('Scoped paths must be non-empty strings.');
      }
      const expanded = expandTilde(raw);
      const absolute = isAbsolute(expanded) ? resolve(expanded) : resolve(root, expanded);
      if (!existsSync(absolute)) {
        throw new InvalidScanTargetError(`Scoped path does not exist: ${raw}`);
      }
      const canonical = await realpath(absolute);
      const contained = toContainedRelative(root, canonical);
      if (contained === null) {
        throw new InvalidScanTargetError(`Scoped path escapes the scan root: ${raw}`);
      }
      seen.add(contained);
    }
    return [...seen];
  }

  /** Duyệt cây thư mục, trả về số file bị bỏ qua (không quét được). */
  private async collectFiles(dir: string, sink: string[], signal?: AbortSignal): Promise<number> {
    let skipped = 0;
    throwIfAborted(signal);
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      throwIfAborted(signal);
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (this.excludedDirs.has(entry.name) || entry.name.startsWith('.')) continue;
        skipped += await this.collectFiles(full, sink, signal);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SCANNABLE_EXTENSIONS.has(ext) || entry.name.startsWith('.env')) {
          sink.push(full);
        } else {
          skipped++;
        }
      }
    }
    return skipped;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fingerprint(ruleId: string, path: string, evidence: string): string {
  return createHash('sha256')
    .update(`${ruleId}|${path}|${evidence.replace(/\s+/g, ' ')}`)
    .digest('hex');
}

/** Đếm số ký tự '\n' trong khoảng [start, end) — dùng cho fast scan. */
function countNewlines(content: string, start: number, end: number): number {
  let count = 0;
  for (let i = start; i < end; i++) {
    if (content.charCodeAt(i) === 10) count++;
  }
  return count;
}

function countBySeverity(findings: ScanFinding[]): Record<FindingSeverityLevel, number> {
  const counts: Record<FindingSeverityLevel, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };
  for (const f of findings) counts[f.severity.level]++;
  return counts;
}

/** Điểm 0–100, cùng trọng số với AuditRunner (critical trừ nặng nhất). */
function computeScore(counts: Record<FindingSeverityLevel, number>): number {
  const penalty = counts.critical * 25 + counts.high * 10 + counts.medium * 4 + counts.low;
  return Math.max(0, 100 - penalty);
}

/**
 * Return `child` as a POSIX-relative path when it is inside `root`, or null
 * when it would escape the root (guards against `..` traversal and absolute
 * paths on a different drive/mount).
 */
function toContainedRelative(root: string, child: string): string | null {
  const rel = relative(root, child);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

/** Expand a leading `~` / `~/` to the current user's home directory. */
function expandTilde(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return resolve(homedir(), value.slice(2).replace(/^[/\\]+/, ''));
  }
  return value;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw signal.reason ?? new Error('The scan was aborted.');
  }
}
