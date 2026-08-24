// Post-action verification (evidence-based), error taxonomy and retry policy
// (Stagehand verifier + browser-use recovery pattern).

export type ActErrorCategory =
  | 'timeout'
  | 'not-found'
  | 'stale'
  | 'navigation'
  | 'blocked'
  | 'unknown';

export interface ActOutcome {
  ok: boolean;
  /** Evidence for the outcome (dom change, url change, element found). */
  evidence: string[];
  error?: ActError;
}

export interface ActError {
  category: ActErrorCategory;
  message: string;
}

export interface ActEvidence {
  urlBefore?: string;
  urlAfter?: string;
  /** DOM hash before/after (mutation detection). */
  domBefore?: string;
  domAfter?: string;
  /** Whether the target element was found after the action. */
  elementFound?: boolean;
  /** Element text after the action. */
  elementText?: string;
}

export interface ActVerifier {
  (action: string, args: Record<string, unknown>, evidence: ActEvidence): ActOutcome;
}

export const DEFAULT_ACT_VERIFIER: ActVerifier = (action, _args, evidence) => {
  if (action === 'navigate') {
    if (evidence.urlBefore && evidence.urlAfter && evidence.urlBefore !== evidence.urlAfter) {
      return { ok: true, evidence: [`navigated ${evidence.urlBefore} → ${evidence.urlAfter}`] };
    }
    return {
      ok: false,
      evidence: [],
      error: { category: 'navigation', message: 'navigation did not change the URL' },
    };
  }
  if (action === 'click' || action === 'fill' || action === 'submit') {
    if (evidence.domBefore && evidence.domAfter && evidence.domBefore !== evidence.domAfter) {
      return { ok: true, evidence: ['DOM mutated after action'] };
    }
    return {
      ok: false,
      evidence: [],
      error: { category: 'stale', message: 'DOM unchanged after action' },
    };
  }
  if (action === 'extract') {
    if (evidence.elementFound) {
      return { ok: true, evidence: [`extracted ${(evidence.elementText ?? '').slice(0, 80)}`] };
    }
    return {
      ok: false,
      evidence: [],
      error: { category: 'not-found', message: 'target element not found' },
    };
  }
  return { ok: true, evidence: [`${action} completed`] };
};

/** Classify an action failure into the taxonomy. */
export function classifyActError(err: unknown): ActError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (/timeout|timed out/i.test(lower)) return { category: 'timeout', message };
  if (/not found|no element|missing|no such/i.test(lower))
    return { category: 'not-found', message };
  if (/stale|detached|detached from/i.test(lower)) return { category: 'stale', message };
  if (/blocked|denied|permission|captcha|net::err_blocked/i.test(lower))
    return { category: 'blocked', message };
  if (/navigation|did not navigate|net::err/i.test(lower))
    return { category: 'navigation', message };
  return { category: 'unknown', message };
}

export interface RetryPolicy {
  maxAttempts: number;
  /** Base delay in ms; exponential backoff. */
  baseDelayMs?: number;
  /** Categories that are retryable. */
  retryable?: ActErrorCategory[];
}

export interface RetryResult {
  attempts: number;
  outcome: ActOutcome;
}

/**
 * Run an action with the verifier + retry policy: retries only retryable
 * error categories with exponential backoff.
 */
export async function runActionWithRetry(
  action: string,
  args: Record<string, unknown>,
  execute: () => Promise<ActEvidence>,
  verify: ActVerifier = DEFAULT_ACT_VERIFIER,
  policy: RetryPolicy = {
    maxAttempts: 1,
    baseDelayMs: 300,
    retryable: ['timeout', 'stale', 'not-found'],
  },
): Promise<RetryResult> {
  const retryable = policy.retryable ?? ['timeout', 'stale', 'not-found'];
  let lastOutcome: ActOutcome = { ok: false, evidence: [] };

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      const evidence = await execute();
      lastOutcome = verify(action, args, evidence);
      if (lastOutcome.ok) return { attempts: attempt, outcome: lastOutcome };
    } catch (err) {
      lastOutcome = {
        ok: false,
        evidence: [],
        error: classifyActError(err),
      };
    }
    const category = lastOutcome.error?.category ?? 'unknown';
    if (attempt < policy.maxAttempts && retryable.includes(category)) {
      const delay = Math.min((policy.baseDelayMs ?? 300) * Math.pow(2, attempt - 1), 5000);
      await sleep(delay);
      continue;
    }
    break;
  }
  return { attempts: policy.maxAttempts, outcome: lastOutcome };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
