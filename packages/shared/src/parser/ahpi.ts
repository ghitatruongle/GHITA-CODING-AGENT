// ==============================================================================
// GHITA CODING AGENT - AHPI (Automatic Hot-Path Instrumentation)
// ==============================================================================
// Profiles JS/TS execution at function boundary level using AST-like brace parsing.
// Generates a performance heatmap (Red: slow, Orange: warning, Green: fast).
// ==============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ProfilerRecord {
  name: string;
  calls: number;
  totalTimeMs: number;
  averageTimeMs: number;
}

export class GHITAProfilerRegistry {
  private records = new Map<string, { calls: number; totalTimeMs: number }>();
  private activeRuns = new Map<string, { name: string; start: number }>();
  private idCounter = 0;

  enter(name: string): string {
    const id = `run-${this.idCounter++}`;
    // Using performance.now() for sub-millisecond precision profiling
    this.activeRuns.set(id, { name, start: performance.now() });
    return id;
  }

  exit(id: string): void {
    const run = this.activeRuns.get(id);
    if (!run) return;
    this.activeRuns.delete(id);
    const duration = performance.now() - run.start;

    let record = this.records.get(run.name);
    if (!record) {
      record = { calls: 0, totalTimeMs: 0 };
      this.records.set(run.name, record);
    }
    record.calls++;
    record.totalTimeMs += duration;
  }

  clear(): void {
    this.records.clear();
    this.activeRuns.clear();
  }

  getReports(): ProfilerRecord[] {
    const reports: ProfilerRecord[] = [];
    for (const [name, data] of this.records.entries()) {
      reports.push({
        name,
        calls: data.calls,
        totalTimeMs: data.totalTimeMs,
        averageTimeMs: data.calls > 0 ? data.totalTimeMs / data.calls : 0,
      });
    }
    return reports.sort((a, b) => b.totalTimeMs - a.totalTimeMs); // sort by total execution time descending
  }
}

// Global registry attachment to share profiler state across module boundaries
if (!(globalThis as any).__ghita_profiler) {
  (globalThis as any).__ghita_profiler = new GHITAProfilerRegistry();
}
export const ghitaProfiler: GHITAProfilerRegistry = (globalThis as any).__ghita_profiler;

/**
 * Categorizes the performance of a function into heatmap colors.
 */
export function getHeatmapColor(record: ProfilerRecord): 'red' | 'orange' | 'green' {
  if (record.averageTimeMs >= 100) return 'red';     // >100ms: Critical bottleneck
  if (record.averageTimeMs >= 10) return 'orange';   // 10ms-100ms: Warning
  return 'green';                                    // <10ms: Healthy / fast
}

/**
 * Scans JS/TS code to locate function boundaries and inject entry/exit hooks.
 * Uses a brace-balanced parser that correctly skips string literals and comments.
 */
export function instrumentCode(code: string, fileName = 'file.js'): string {
  const reservedKeywords = new Set([
    'if', 'for', 'while', 'catch', 'switch', 'return',
    'with', 'function', 'class', 'import', 'export',
    'default', 'try', 'constructor'
  ]);

  // Regex to match function declarations and class methods
  const funcRegex = /(?:(async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*\{)|(?:(async\s+)?(?:(public|private|protected|get|set)\s+)?([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*\{)/g;
  
  const matches: Array<{ name: string; openBraceIndex: number }> = [];
  let match;

  while ((match = funcRegex.exec(code)) !== null) {
    const isStandardFunc = match[2] !== undefined;
    const funcName = isStandardFunc ? match[2]! : match[6]!;

    if (reservedKeywords.has(funcName)) {
      continue;
    }

    const openBraceIndex = match.index + match[0].length - 1;
    matches.push({ name: `${fileName}:${funcName}`, openBraceIndex });
  }

  // Process matches from last to first (right-to-left) to keep index positions constant
  let instrumentedCode = code;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!;
    const closeBraceIndex = findClosingBrace(instrumentedCode, m.openBraceIndex);
    if (closeBraceIndex !== -1) {
      const originalBody = instrumentedCode.substring(m.openBraceIndex + 1, closeBraceIndex);
      // Skip wrapping if already instrumented to prevent duplicate hooks
      if (originalBody.includes('__ghita_perf_id')) {
        continue;
      }
      
      const wrappedBody = `\n  const __ghita_perf_id = globalThis.__ghita_profiler.enter("${m.name}");\n  try {\n    ${originalBody}\n  } finally {\n    globalThis.__ghita_profiler.exit(__ghita_perf_id);\n  }\n`;
      
      instrumentedCode = 
        instrumentedCode.substring(0, m.openBraceIndex + 1) +
        wrappedBody +
        instrumentedCode.substring(closeBraceIndex);
    }
  }

  return instrumentedCode;
}

/**
 * Finds the index of the matching closing brace '}' for an opening brace at startIndex.
 * Correctly ignores braces inside comments and string literals.
 */
function findClosingBrace(code: string, startIndex: number): number {
  let braceCount = 1;
  let i = startIndex + 1;
  
  while (i < code.length) {
    const char = code[i];
    const nextChar = code[i + 1];

    // Skip line comments
    if (char === '/' && nextChar === '/') {
      while (i < code.length && code[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Skip block comments
    if (char === '/' && nextChar === '*') {
      i += 2;
      while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }

    // Skip string literals (handles escape characters)
    if (char === "'" || char === '"' || char === '`') {
      const quoteType = char;
      i++;
      while (i < code.length) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (code[i] === quoteType) {
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        return i;
      }
    }
    i++;
  }
  
  return -1;
}

/**
 * Programmatically wraps a function for profiling (ideal for arrow functions or runtime hooks).
 */
export function profileFunction<T extends (...args: any[]) => any>(
  name: string,
  fn: T
): T {
  return function (this: any, ...args: any[]) {
    const id = ghitaProfiler.enter(name);
    try {
      const result = fn.apply(this, args);
      if (result instanceof Promise) {
        return result.then(
          (val) => {
            ghitaProfiler.exit(id);
            return val;
          },
          (err) => {
            ghitaProfiler.exit(id);
            throw err;
          }
        ) as any;
      }
      ghitaProfiler.exit(id);
      return result;
    } catch (err) {
      ghitaProfiler.exit(id);
      throw err;
    }
  } as T;
}

/**
 * Instruments a file on disk temporarily, runs the execution callback, and restores the original file content.
 */
export async function profileExecution(
  filePath: string,
  executeFn: () => Promise<void>
): Promise<ProfilerRecord[]> {
  const resolvedPath = path.resolve(filePath);
  const originalContent = fs.readFileSync(resolvedPath, 'utf8');
  const instrumentedContent = instrumentCode(originalContent, path.basename(filePath));

  ghitaProfiler.clear();
  try {
    fs.writeFileSync(resolvedPath, instrumentedContent, 'utf8');
    // Evict module from Node's require/import cache to force execution of instrumented code
    if (typeof require !== 'undefined' && require.cache) {
      delete require.cache[resolvedPath];
    }
    await executeFn();
  } finally {
    // Ensure the original code is always restored even if execution fails
    fs.writeFileSync(resolvedPath, originalContent, 'utf8');
    if (typeof require !== 'undefined' && require.cache) {
      delete require.cache[resolvedPath];
    }
  }

  return ghitaProfiler.getReports();
}
