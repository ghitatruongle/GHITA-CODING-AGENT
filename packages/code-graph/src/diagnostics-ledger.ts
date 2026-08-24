// Collects language server diagnostics, tracks turn-to-turn diffs (new/resolved),
// and formats non-blocking deferred feedback for the next agent observation.

import path from 'node:path';
import { type LspDiagnostic, LspDiagnosticSeverity, type DiagnosticsDiff } from './lsp-types.js';

export class DiagnosticsLedger {
  /** Map of normalized filePath -> LspDiagnostic[] */
  private ledger = new Map<string, LspDiagnostic[]>();

  /**
   * Record new diagnostics for a file and compute the diff vs previous snapshot.
   */
  recordDiagnostics(
    filePath: string,
    diagnostics: LspDiagnostic[],
    source?: string,
  ): DiagnosticsDiff {
    const normalized = path.resolve(filePath);
    const existing = this.ledger.get(normalized) ?? [];

    const existingKeys = new Map<string, LspDiagnostic>();
    for (const d of existing) {
      if (!source || d.source === source) {
        existingKeys.set(this.diagnosticKey(d), d);
      }
    }

    const newDiagnostics: LspDiagnostic[] = [];
    const unchangedDiagnostics: LspDiagnostic[] = [];
    const incomingKeys = new Set<string>();

    for (const d of diagnostics) {
      const key = this.diagnosticKey(d);
      incomingKeys.add(key);
      if (existingKeys.has(key)) {
        unchangedDiagnostics.push(d);
      } else {
        newDiagnostics.push(d);
      }
    }

    const resolvedDiagnostics: LspDiagnostic[] = [];
    for (const [key, d] of existingKeys) {
      if (!incomingKeys.has(key)) {
        resolvedDiagnostics.push(d);
      }
    }

    // Update stored diagnostics (keeping diagnostics from other sources if source filter was used)
    let updatedList: LspDiagnostic[];
    if (source) {
      const otherSources = existing.filter((d) => d.source !== source);
      updatedList = [...otherSources, ...diagnostics];
    } else {
      updatedList = [...diagnostics];
    }

    if (updatedList.length === 0) {
      this.ledger.delete(normalized);
    } else {
      this.ledger.set(normalized, updatedList);
    }

    return {
      newDiagnostics,
      resolvedDiagnostics,
      unchangedDiagnostics,
    };
  }

  /**
   * Get diagnostics for a specific file or all files, optionally filtered by minSeverity.
   */
  getDiagnostics(
    filePath?: string,
    minSeverity: LspDiagnosticSeverity = LspDiagnosticSeverity.Hint,
  ): LspDiagnostic[] {
    const results: LspDiagnostic[] = [];

    if (filePath) {
      const normalized = path.resolve(filePath);
      const list = this.ledger.get(normalized) ?? [];
      for (const d of list) {
        if (d.severity <= minSeverity) results.push(d);
      }
    } else {
      for (const list of this.ledger.values()) {
        for (const d of list) {
          if (d.severity <= minSeverity) results.push(d);
        }
      }
    }

    // Sort by file, line, character, severity
    return results.sort((a, b) => {
      if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
      if (a.range.start.line !== b.range.start.line) return a.range.start.line - b.range.start.line;
      if (a.range.start.character !== b.range.start.character)
        return a.range.start.character - b.range.start.character;
      return a.severity - b.severity;
    });
  }

  /**
   * Clear diagnostics for a specific file.
   */
  clearFile(filePath: string): void {
    this.ledger.delete(path.resolve(filePath));
  }

  /**
   * Clear all diagnostics from the ledger.
   */
  clear(): void {
    this.ledger.clear();
  }

  /**
   * Get high-level summary of active errors and warnings.
   */
  getSummary(): {
    errorsCount: number;
    warningsCount: number;
    filesWithErrors: string[];
    filesWithWarnings: string[];
  } {
    let errorsCount = 0;
    let warningsCount = 0;
    const filesWithErrors = new Set<string>();
    const filesWithWarnings = new Set<string>();

    for (const [file, list] of this.ledger) {
      for (const d of list) {
        if (d.severity === LspDiagnosticSeverity.Error) {
          errorsCount++;
          filesWithErrors.add(file);
        } else if (d.severity === LspDiagnosticSeverity.Warning) {
          warningsCount++;
          filesWithWarnings.add(file);
        }
      }
    }

    return {
      errorsCount,
      warningsCount,
      filesWithErrors: [...filesWithErrors],
      filesWithWarnings: [...filesWithWarnings],
    };
  }

  private diagnosticKey(d: LspDiagnostic): string {
    return `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character}|${d.severity}|${d.code ?? ''}|${d.message}`;
  }
}

/**
 * Deferred Diagnostics Manager: collects diagnostics produced after file edits
 * and generates late feedback blocks for subsequent LLM agent turns without blocking execution.
 */
export class DeferredDiagnosticsManager {
  private pendingQueue: LspDiagnostic[] = [];

  constructor(private readonly ledger?: DiagnosticsLedger) {}

  /**
   * Get the attached DiagnosticsLedger if present.
   */
  getLedger(): DiagnosticsLedger | undefined {
    return this.ledger;
  }

  /**
   * Queue newly reported diagnostics for deferred feedback.
   */
  enqueue(diagnostics: LspDiagnostic[]): void {
    for (const d of diagnostics) {
      // Only queue errors and warnings for feedback
      if (d.severity <= LspDiagnosticSeverity.Warning) {
        this.pendingQueue.push(d);
      }
    }
  }

  /**
   * Drain pending diagnostics from queue.
   */
  drainPending(): LspDiagnostic[] {
    const list = [...this.pendingQueue];
    this.pendingQueue = [];
    return list;
  }

  /**
   * Check if there are pending errors or warnings.
   */
  hasPending(): boolean {
    return this.pendingQueue.length > 0;
  }

  /**
   * Format late feedback for agent observation (e.g. injected at the start of next turn).
   * Returns null if no errors or warnings are pending.
   */
  formatObservationMessage(rootDir?: string): string | null {
    const pending = this.drainPending();
    if (pending.length === 0) return null;

    const lines: string[] = ['[LSP Diagnostics Feedback]'];

    for (const d of pending) {
      let displayPath = d.filePath;
      if (rootDir && displayPath.startsWith(path.resolve(rootDir))) {
        displayPath = path.relative(path.resolve(rootDir), displayPath).replace(/\\/g, '/');
      } else {
        displayPath = displayPath.replace(/\\/g, '/');
      }

      const severityTag = d.severity === LspDiagnosticSeverity.Error ? 'Error' : 'Warning';
      const codeTag = d.code ? ` (${d.code})` : '';
      const sourceTag = d.source ? ` [${d.source}]` : '';
      const lineNum = d.range.start.line + 1; // 1-based for human/agent reading
      const charNum = d.range.start.character + 1;

      lines.push(
        `• ${displayPath}:${lineNum}:${charNum} - ${severityTag}${codeTag}: ${d.message}${sourceTag}`,
      );
    }

    return lines.join('\n');
  }
}
