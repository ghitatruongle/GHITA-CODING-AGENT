// ==============================================================================
// GHITA CODING AGENT — Phase 10: Anti-Slop Output Filtration Middleware
// ==============================================================================
// Lọc sạch từ ngữ chào hỏi thừa thãi ("Certainly!", "I can help with...")
// ra khỏi luồng stream kết quả LLM để tiết kiệm token tối đa.
// Tham chiếu: Continue (anti-slop)
// ==============================================================================

import type BetterSqlite3 from 'better-sqlite3';
type BetterSqlite3Database = InstanceType<typeof BetterSqlite3>;
import type { ChatMiddleware, ChatStreamMiddleware } from '../utils/middleware.js';
import * as fs from 'fs';
import * as path from 'path';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface AntiSlopConfig {
  /** Custom slop patterns to filter (regex strings) */
  customPatterns?: string[];
  /** Path to slop config YAML file (default: '.ghita/slop.yaml') */
  slopConfigPath?: string;
  /** Enable token savings tracking (default: true) */
  trackSavings?: boolean;
  /** Minimum match length to filter (default: 5) */
  minMatchLength?: number;
}

interface SlopPattern {
  regex: RegExp;
  description: string;
}

interface TokenSavingsLog {
  timestamp: string;
  tokensSaved: number;
  patternsMatched: string[];
  totalInputTokens: number;
}

interface Runnable {
  run(params: Record<string, unknown>): unknown;
}

// ──────────────────────────────────────────────────────────────────────────────
// Default Slop Patterns — common LLM filler phrases
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_SLOP_PATTERNS: SlopPattern[] = [
  // Longer / more specific patterns first to avoid partial matches
  { regex: /^(?:Let me know\s+if\s+you\s+(?:need|have)\s+(?:any(?:thing)?\s+)?(?:else|more)[.!]*\s*)/i, description: 'Let me know if...' },
  { regex: /^(?:Is there\s+anything\s+else\s+(?:I\s+can\s+help\s*(?:with)?|you(?:'d)?\s+(?:like|need))[.!?\s]*)/i, description: 'Is there anything else...' },
  { regex: /^(?:I(?:'d)?\s+(?:can|would\s+(?:be\s+)?(?:happy\s+to|glad\s+to)|(?:am|'m)\s+(?:happy|glad)\s+to|be\s+happy\s+to)\s+help\s+(?:you\s+)?with\s+that[.!]*\s*)/i, description: 'I can help with that' },
  { regex: /^(?:Here(?:'s| is)\s+(?:the\s+)?(?:updated|modified|new|revised)\s+\w+[:.!]*\s*)/i, description: 'Here is the updated...' },
  { regex: /^(?:Here are\s+(?:the\s+)?(?:steps|some|a few)[.!]*\s*)/i, description: 'Here are the steps...' },
  { regex: /^(?:I hope\s+(?:this|that)\s+(?:helps|is helpful|answers your question)[.!]*\s*)/i, description: 'I hope this helps' },
  { regex: /^(?:I(?:'ll| will)\s+(?:now\s+)?(?:help|assist)\s+you[.!]*\s*)/i, description: "I'll help you" },
  { regex: /^(?:Let me\s+(?:help\s+you\s+)?(?:with\s+that)[.!]*\s*)/i, description: 'Let me help...' },
  { regex: /^(?:Hope\s+(?:this|that)\s+helps[.!]*\s*)/i, description: 'Hope this helps' },
  { regex: /^(?:Feel free\s+to\s+ask[.!]*\s*)/i, description: 'Feel free to ask' },
  { regex: /^(?:Happy\s+to\s+help[.!]*\s*)/i, description: 'Happy to help' },
  { regex: /^(?:Great question!?\s*)/i, description: 'Great question!' },
  { regex: /^(?:Certainly!?\s*)/i, description: 'Certainly!' },
  { regex: /^(?:Of course!?\s*)/i, description: 'Of course!' },
  { regex: /^(?:Absolutely!?\s*)/i, description: 'Absolutely!' },
  { regex: /^(?:Sure\s+thing[.!]*\s*)/i, description: 'Sure thing' },
  { regex: /^(?:Sure!?\s*)/i, description: 'Sure!' },
];

// ──────────────────────────────────────────────────────────────────────────────
// Aho-Corasick Implementation — multi-pattern string matching in O(n)
// ──────────────────────────────────────────────────────────────────────────────

class AhoCorasick {
  private gotoFn: Map<string, number>[] = [];
  private outputFn: number[][] = [];
  private failFn: number[] = [];
  private built = false;

  constructor(private patterns: string[]) {}

  build(): void {
    const gotoFn: Map<string, number>[] = [new Map()];
    const outputFn: number[][] = [[]];

    // Step 1: Build goto function
    let newState = 0;
    for (let i = 0; i < this.patterns.length; i++) {
      const patternText = this.patterns[i]?.toLowerCase();
      if (!patternText) continue;
      let currentState = 0;

      for (const char of patternText) {
        if (!gotoFn[currentState]) gotoFn[currentState] = new Map();
        const currentGoto = gotoFn[currentState];
        if (!currentGoto) continue;
        const next = currentGoto.get(char);
        if (next !== undefined) {
          currentState = next;
        } else {
          newState++;
          if (!gotoFn[currentState]) gotoFn[currentState] = new Map();
          const stateGoto = gotoFn[currentState];
          if (stateGoto) stateGoto.set(char, newState);
          gotoFn[newState] = new Map();
          outputFn[newState] = [];
          currentState = newState;
        }
      }
      if (!outputFn[currentState]) outputFn[currentState] = [];
      outputFn[currentState]?.push(i);
    }

    // Fill missing goto for root
    if (!gotoFn[0]) gotoFn[0] = new Map();

    // Step 2: Build failure function (BFS)
    const queue: number[] = [];
    const failFn: number[] = new Array(newState + 1).fill(0);

    // Set fail for depth-1 states to 0
    for (const [_char, state] of gotoFn[0] ?? new Map()) {
      failFn[state] = 0;
      queue.push(state);
    }

    while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const currentGoto = gotoFn[current] || new Map();

      for (const [char, nextState] of currentGoto) {
        queue.push(nextState);
        let fail = failFn[current] ?? 0;
        while (!(gotoFn[fail] ?? new Map()).has(char) && fail !== 0) {
          fail = failFn[fail] ?? 0;
        }
        const failTarget = (gotoFn[fail] ?? new Map()).get(char);
        failFn[nextState] = (failTarget !== undefined && failTarget !== nextState) ? failTarget : 0;

        // Merge output
        outputFn[nextState] = [...(outputFn[nextState] ?? []), ...(outputFn[failFn[nextState] ?? 0] ?? [])];
      }
    }

    this.gotoFn = gotoFn;
    this.outputFn = outputFn;
    this.failFn = failFn;
    this.built = true;
  }

  /** Find all pattern matches in text. Returns {patternIndex, position}[] */
  search(text: string): Array<{ patternIndex: number; endPos: number }> {
    if (!this.built) this.build();

    const results: Array<{ patternIndex: number; endPos: number }> = [];
    let currentState = 0;
    const lower = text.toLowerCase();

    for (let i = 0; i < lower.length; i++) {
      const char = lower[i];
    if (char === undefined) continue;
      while (!(this.gotoFn[currentState] || new Map()).has(char) && currentState !== 0) {
        currentState = this.failFn[currentState] ?? 0;
      }
      const next = (this.gotoFn[currentState] || new Map()).get(char);
      currentState = next !== undefined ? next : 0;

      const outputs = this.outputFn[currentState] || [];
      for (const patternIdx of outputs) {
        results.push({ patternIndex: patternIdx, endPos: i });
      }
    }

    return results;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Markdown Code Block Detection — disable filter inside code blocks
// ──────────────────────────────────────────────────────────────────────────────

interface CodeBlockState {
  inCodeBlock: boolean;
  fenceChar: '`' | '~';
  fenceCount: number;
}

function createCodeBlockDetector(): CodeBlockState {
  return { inCodeBlock: false, fenceChar: '`', fenceCount: 0 };
}

/**
 * Update code block state based on a line of text.
 * Returns true if the line is inside a code block (should NOT be filtered).
 */
function isInsideCodeBlock(state: CodeBlockState, line: string): boolean {
  const trimmed = line.trimStart();

  // Detect opening/closing fence: ``` or ~~~
  const backtickMatch = trimmed.match(/^(`{3,})/);
  const tildeMatch = trimmed.match(/^(~{3,})/);

  if (backtickMatch || tildeMatch) {
    const match = backtickMatch || tildeMatch;
    if (!match || !match[1]) return state.inCodeBlock;
    const fence = (match[1][0] as '`' | '~');
    const count = match[1].length;

    if (!state.inCodeBlock) {
      // Opening fence
      state.inCodeBlock = true;
      state.fenceChar = fence;
      state.fenceCount = count;
      return true; // The fence line itself is part of code block
    } else if (fence === state.fenceChar && count >= state.fenceCount) {
      // Closing fence
      state.inCodeBlock = false;
      state.fenceCount = 0;
      return true;
    }
  }

  return state.inCodeBlock;
}

// ──────────────────────────────────────────────────────────────────────────────
// Slop YAML Loader (simple key-value parser)
// ──────────────────────────────────────────────────────────────────────────────

function loadSlopConfig(configPath: string): string[] {
  try {
    const resolved = path.resolve(configPath);
    if (!fs.existsSync(resolved)) return [];

    const content = fs.readFileSync(resolved, 'utf-8');
    const patterns: string[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Format: - pattern: "regex here"
    const match = trimmed.match(/^-\s*(?:pattern:\s*)?["'](.+)["']/);
    if (match && match[1]) {
      patterns.push(match[1]);
      } else if (trimmed.startsWith('- ')) {
        // Simple list format: - Certainly!
        patterns.push(trimmed.slice(2).replace(/["']/g, ''));
      }
    }

    return patterns;
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Token Savings Tracker
// ──────────────────────────────────────────────────────────────────────────────

class TokenSavingsTracker {
  private logs: TokenSavingsLog[] = [];
  private totalSaved = 0;
  private dbPath: string | null = null;
  private db: BetterSqlite3Database | null = null;
  private insertStmt: Runnable | null = null;
  private dbInitialized = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? null;
  }

  /** Initialize SQLite database and create table (lazy, async) */
  private async ensureDb(): Promise<void> {
    if (this.dbInitialized || !this.dbPath) return;
    this.dbInitialized = true;

    try {
      const Database = (await import('better-sqlite3')).default;
      this.db = new Database(this.dbPath) as InstanceType<typeof Database>;

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS anti_slop_savings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          tokens_saved INTEGER NOT NULL,
          patterns_matched TEXT NOT NULL,
          total_input_tokens INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_savings_timestamp
        ON anti_slop_savings(timestamp);
      `);

      this.insertStmt = this.db.prepare(`
        INSERT INTO anti_slop_savings (timestamp, tokens_saved, patterns_matched, total_input_tokens)
        VALUES (@timestamp, @tokensSaved, @patternsMatched, @totalInputTokens)
      `) as Runnable;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[AntiSlop] SQLite unavailable (${message}), using in-memory only`);
      this.db = null;
      this.insertStmt = null;
    }
  }

  /** Export a single savings entry to SQLite */
  private async exportToSqlite(entry: TokenSavingsLog): Promise<void> {
    await this.ensureDb();

    if (this.insertStmt) {
      try {
        this.insertStmt.run({
          timestamp: entry.timestamp,
          tokensSaved: entry.tokensSaved,
          patternsMatched: JSON.stringify(entry.patternsMatched),
          totalInputTokens: entry.totalInputTokens,
        });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[AntiSlop] SQLite insert failed: ${message}`);
      }
    }
  }

  record(tokensSaved: number, patternsMatched: string[], totalInputTokens: number): void {
    this.totalSaved += tokensSaved;
    const entry: TokenSavingsLog = {
      timestamp: new Date().toISOString(),
      tokensSaved,
      patternsMatched,
      totalInputTokens,
    };
    this.logs.push(entry);

    // Async SQLite export (fire-and-forget, non-blocking)
    if (this.dbPath) {
      this.exportToSqlite(entry).catch(() => { /* swallow */ });
    }
  }

  getTotalSaved(): number {
    return this.totalSaved;
  }

  getLogs(): TokenSavingsLog[] {
    return [...this.logs];
  }

  getSummary(): { totalSaved: number; passCount: number; avgSavedPerPass: number } {
    return {
      totalSaved: this.totalSaved,
      passCount: this.logs.length,
      avgSavedPerPass: this.logs.length > 0 ? Math.round(this.totalSaved / this.logs.length) : 0,
    };
  }

  /** Close SQLite connection */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.insertStmt = null;
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Core: Anti-Slop Filter
// ──────────────────────────────────────────────────────────────────────────────

export class AntiSlopFilter {
  private patterns: SlopPattern[];
  private acMatcher: AhoCorasick;
  private codeBlockState = createCodeBlockDetector();
  private savingsTracker: TokenSavingsTracker;
  private config: Required<AntiSlopConfig>;

  constructor(config: AntiSlopConfig = {}) {
    this.config = {
      customPatterns: config.customPatterns ?? [],
      slopConfigPath: config.slopConfigPath ?? '.ghita/slop.yaml',
      trackSavings: config.trackSavings ?? true,
      minMatchLength: config.minMatchLength ?? 5,
    };

    // Build pattern list: defaults + custom + YAML config
    this.patterns = [...DEFAULT_SLOP_PATTERNS];

    // Add custom patterns from config
    for (const p of this.config.customPatterns) {
      try {
        this.patterns.push({ regex: new RegExp(`^(?:${p}[.!]*\\s*)`, 'i'), description: p.toLowerCase() });
      } catch {
        // Invalid regex, skip
      }
    }

    // Add patterns from .ghita/slop.yaml
    const yamlPatterns = loadSlopConfig(this.config.slopConfigPath);
    for (const p of yamlPatterns) {
      try {
        this.patterns.push({ regex: new RegExp(`^(?:${p}[.!]*\\s*)`, 'i'), description: p.toLowerCase() });
      } catch {
        // Invalid regex, skip
      }
    }

    // Build Aho-Corasick matcher from pattern descriptions (for fast string search)
    const acPatterns = this.patterns.map((p) => p.description.toLowerCase());
    this.acMatcher = new AhoCorasick(acPatterns);
    this.acMatcher.build();

    this.savingsTracker = new TokenSavingsTracker();
  }

  /** Get the underlying Aho-Corasick matcher instance */
  getAcMatcher(): AhoCorasick {
    return this.acMatcher;
  }

  /** Get the savings tracker instance */
  getSavingsTracker(): TokenSavingsTracker {
    return this.savingsTracker;
  }

  /** Try to strip one leading slop phrase from text. Returns whether a match was found. */
  private tryStripOne(text: string): { cleaned: string; removed: number; pattern: string } | null {
    // Try all patterns in order (longer/specific first)
    for (const pattern of this.patterns) {
      const match = text.match(pattern.regex);
      if (match && match[0] && match[0].length >= this.config.minMatchLength) {
        const remainder = text.slice(match[0].length).trimStart();
        return { cleaned: remainder, removed: match[0].length, pattern: pattern.description };
      }
    }
    return null;
  }

  /** Clean a single text chunk — strip leading slop phrases (multi-pass for chained slop) */
  cleanChunk(text: string): { cleaned: string; charsRemoved: number; matchedPatterns: string[] } {
    if (!text || text.length < this.config.minMatchLength) {
      return { cleaned: text, charsRemoved: 0, matchedPatterns: [] };
    }

    const leadingSpaces = text.match(/^(\s*)/)?.[1] ?? '';
    let cleaned = text.slice(leadingSpaces.length);
    let totalRemoved = 0;
    const matchedPatterns: string[] = [];

    // Multi-pass: keep stripping until no more slop matches (handles chained slop)
    const MAX_PASSES = 5;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const result = this.tryStripOne(cleaned);
      if (!result) break;
      cleaned = result.cleaned;
      totalRemoved += result.removed;
      matchedPatterns.push(result.pattern);
    }

    // If no slop matched, restore leading spaces
    if (matchedPatterns.length === 0) {
      cleaned = leadingSpaces + cleaned;
    } else if (leadingSpaces.length > 0) {
      totalRemoved += leadingSpaces.length;
    }

    return { cleaned, charsRemoved: totalRemoved, matchedPatterns };
  }

  /** Clean accumulated text with code block awareness */
  cleanWithCodeBlockAwareness(text: string): { cleaned: string; charsRemoved: number; matchedPatterns: string[] } {
    const lines = text.split('\n');
    const cleanedLines: string[] = [];
    let totalRemoved = 0;
    const allMatched: string[] = [];

    for (const line of lines) {
      const inCode = isInsideCodeBlock(this.codeBlockState, line);

      if (inCode) {
        // Inside code block — do NOT filter
        cleanedLines.push(line);
      } else {
        const result = this.cleanChunk(line);
        cleanedLines.push(result.cleaned);
        totalRemoved += result.charsRemoved;
        allMatched.push(...result.matchedPatterns);
      }
    }

    return {
      cleaned: cleanedLines.join('\n'),
      charsRemoved: totalRemoved,
      matchedPatterns: allMatched,
    };
  }

  /** Get token savings summary */
  getSavingsSummary(): { totalSaved: number; passCount: number; avgSavedPerPass: number } {
    return this.savingsTracker.getSummary();
  }

  /** Get detailed savings logs */
  getSavingsLogs(): TokenSavingsLog[] {
    return this.savingsTracker.getLogs();
  }

  /** Reset code block state (call before processing a new stream) */
  resetCodeBlockState(): void {
    this.codeBlockState = createCodeBlockDetector();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Factory: Create ChatStreamMiddleware (for wrapping LLM stream output)
// ──────────────────────────────────────────────────────────────────────────────

export function createAntiSlopStreamMiddleware(config?: AntiSlopConfig): ChatStreamMiddleware {
  const filter = new AntiSlopFilter(config);
  let buffer = '';

  return async (_params, next) => {
    const stream = await next();

    filter.resetCodeBlockState();
    buffer = '';

    return (async function* () {
      for await (const chunk of stream) {
        const text = chunk.content ?? '';
        if (!text) {
          yield chunk;
          continue;
        }

        // Buffer text and process line-by-line for code block awareness
        buffer += text;

        // Process complete lines
        const lastNewline = buffer.lastIndexOf('\n');
        if (lastNewline === -1 && !chunk.done) {
          // No complete line yet — keep buffering
          continue;
        }

        if (lastNewline === -1 && chunk.done) {
          // No newline but it's the final chunk — process buffer
          const result = filter.cleanWithCodeBlockAwareness(buffer);
          buffer = '';

          // Track savings
          if (config?.trackSavings !== false && result.charsRemoved > 0) {
            const approxTokensSaved = Math.ceil(result.charsRemoved / 4);
            filter.getSavingsTracker().record(approxTokensSaved, result.matchedPatterns, text.length);
          }

          if (result.cleaned) {
            yield { ...chunk, content: result.cleaned };
          }
          continue;
        }

        const processable = lastNewline >= 0 ? buffer.slice(0, lastNewline + 1) : buffer;
        buffer = lastNewline >= 0 ? buffer.slice(lastNewline + 1) : '';

        const result = filter.cleanWithCodeBlockAwareness(processable);

        // Track savings
        if (config?.trackSavings !== false && result.charsRemoved > 0) {
          const approxTokensSaved = Math.ceil(result.charsRemoved / 4);
          filter.getSavingsTracker().record(approxTokensSaved, result.matchedPatterns, text.length);
        }

        // Only yield if there's content after cleaning
        if (result.cleaned || chunk.done) {
          yield {
            ...chunk,
            content: result.cleaned || '',
          };
        }
      }

      // Flush remaining buffer
      if (buffer.length > 0) {
        const result = filter.cleanWithCodeBlockAwareness(buffer);
        if (result.cleaned) {
          yield { content: result.cleaned, done: true };
        }
      }
    })();
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Factory: Create ChatMiddleware (for non-streaming responses)
// ──────────────────────────────────────────────────────────────────────────────

export function createAntiSlopMiddleware(config?: AntiSlopConfig): ChatMiddleware {
  const filter = new AntiSlopFilter(config);

  return async (_params, next) => {
    const response = await next();

    if (response.content) {
      filter.resetCodeBlockState();
      const result = filter.cleanWithCodeBlockAwareness(response.content);

      if (config?.trackSavings !== false && result.charsRemoved > 0) {
        const approxTokensSaved = Math.ceil(result.charsRemoved / 4);
        filter.getSavingsTracker().record(approxTokensSaved, result.matchedPatterns, response.content.length);
      }

      return {
        ...response,
        content: result.cleaned,
      };
    }

    return response;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Standalone: quick clean utility (no middleware needed)
// ──────────────────────────────────────────────────────────────────────────────

export function cleanSlop(text: string, config?: AntiSlopConfig): string {
  const filter = new AntiSlopFilter(config);
  filter.resetCodeBlockState();
  return filter.cleanWithCodeBlockAwareness(text).cleaned;
}
