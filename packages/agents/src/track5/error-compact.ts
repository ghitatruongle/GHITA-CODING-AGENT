// Classifies errors into a compact taxonomy and formats them for direct
// context append (12-factor factor-09: compact errors into context so the
// model can self-correct — no noisy logs).

export type ErrorCategory =
  | 'timeout'
  | 'rate-limit'
  | 'parse'
  | 'network'
  | 'permission'
  | 'tool-error'
  | 'model-error'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  /** One-line, redacted description safe for context injection. */
  compact: string;
  /** Suggested corrective action. */
  remedy?: string;
}

const PATTERNS: Array<{ category: ErrorCategory; test: RegExp; remedy?: string }> = [
  {
    category: 'timeout',
    test: /timeout|timed out|ETIMEDOUT|deadline/i,
    remedy: 'retry with a longer timeout or smaller task',
  },
  {
    category: 'rate-limit',
    test: /rate.?limit|429|too many requests|quota/i,
    remedy: 'wait and retry; switch model/key if needed',
  },
  {
    category: 'parse',
    test: /parse|syntaxerror|unexpected token|invalid json|malformed/i,
    remedy: 'repair the arguments and retry',
  },
  {
    category: 'network',
    test: /network|ECONNREFUSED|ENOTFOUND|socket|fetch failed/i,
    remedy: 'check connectivity and retry',
  },
  {
    category: 'permission',
    test: /permission|denied|forbidden|not allowed|eacces/i,
    remedy: 'request approval or use an allowed tool',
  },
  {
    category: 'tool-error',
    test: /tool.*(error|not found)|unknown tool|no such file|exit code/i,
    remedy: 'verify tool input and retry',
  },
  {
    category: 'model-error',
    test: /invalid api key|401|403|model.*(not found|unavailable)|context length/i,
    remedy: 'rotate key or select another model',
  },
];

/** Classify an error message into the compact taxonomy. */
export function classifyError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err);
  for (const { category, test, remedy } of PATTERNS) {
    if (test.test(message)) {
      return { category, compact: `[${category}] ${truncate(message, 180)}`, remedy };
    }
  }
  return { category: 'unknown', compact: truncate(message, 180) };
}

/** Format a compact error line for direct context append. */
export function compactErrorForContext(err: unknown, attempt = 1): string {
  const classified = classifyError(err);
  const remedy = classified.remedy ? ` → ${classified.remedy}` : '';
  return `ERROR (attempt ${attempt}): ${classified.compact}${remedy}`;
}

function truncate(s: string, n: number): string {
  const cleaned = s.replace(/\s+/g, ' ').trim();
  return cleaned.length > n ? `${cleaned.slice(0, n)}…` : cleaned;
}

/** Track repeated errors with backoff suggestion. */
export function backoffForAttempt(attempt: number, baseMs = 1000): number {
  return Math.min(baseMs * Math.pow(2, attempt - 1), 30_000);
}
