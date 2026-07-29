// ==============================================================================
// v0.4.9 A6: AI Page API (act / extract / observe)
//
// A three-verb high-level API on top of the existing BrowserController + AI
// selector resolution:
//   • observe()  — enumerate actionable elements (accessibility-ish snapshot)
//   • act()      — perform a natural-language action with selector self-heal
//   • extract()  — schema-driven extraction validated by a zod-compatible schema
// ==============================================================================

import type { BrowserController } from './index.js';
import {
  collectCandidates,
  resolveSelectorByIntent,
  aiExtract,
  type AIBrowserContext,
  type PageElementCandidate,
} from './ai-browser.js';

/** A zod-compatible schema (structural — avoids a hard zod dependency). */
export interface SchemaLike<T> {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: unknown };
}

/** One observed actionable element with a suggested action. */
export interface ObserveResult {
  selector: string;
  description: string;
  suggestedAction: 'click' | 'fill';
  candidate: PageElementCandidate;
}

export interface ActResult {
  success: boolean;
  action: 'click' | 'fill';
  selector?: string;
  /** Number of attempts made (self-heal retries included). */
  attempts: number;
  error?: string;
}

export interface ExtractResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** Set when a schema was supplied but validation failed. */
  validationError?: unknown;
}

const FILL_INTENT = /\b(type|fill|enter|input|write|search for|paste)\b/i;

/**
 * AIPageController — high-level AI actions bound to one BrowserController + page.
 *
 * Sử dụng:
 *   const page = new AIPageController(controller, rawPage, { llm });
 *   await page.observe('the login button');
 *   await page.act('click the login button');
 *   const data = await page.extract('the article title and author', schema);
 */
export class AIPageController {
  constructor(
    private readonly controller: BrowserController,
    private readonly page: unknown,
    private readonly ctx: AIBrowserContext = {},
  ) {}

  /**
   * Observe actionable elements. When an instruction is given, returns only the
   * best match; otherwise returns all collected candidates ranked as-is.
   */
  async observe(instruction?: string): Promise<ObserveResult[]> {
    const candidates = await collectCandidates(this.page, this.ctx.maxCandidates ?? 30);
    if (candidates.length === 0) return [];

    if (!instruction) {
      return candidates.map((c) => this.toObserveResult(c));
    }
    const best = await resolveSelectorByIntent(instruction, candidates, this.ctx);
    return best ? [this.toObserveResult(best)] : [];
  }

  /**
   * Perform a natural-language action. Chooses click vs fill from the wording,
   * and self-heals a failed selector by re-observing and retrying once.
   */
  async act(instruction: string, value?: string): Promise<ActResult> {
    const wantsFill = FILL_INTENT.test(instruction);
    let attempts = 0;
    let lastError: string | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      attempts++;
      const candidates = await collectCandidates(this.page, this.ctx.maxCandidates ?? 30);
      if (candidates.length === 0) {
        lastError = 'No interactive elements found on page.';
        continue;
      }
      const target = await resolveSelectorByIntent(
        deriveTargetPhrase(instruction),
        candidates,
        this.ctx,
      );
      if (!target) {
        lastError = `No element matches intent: ${instruction}`;
        continue;
      }

      const isFill = wantsFill || target.tag === 'input' || target.tag === 'textarea';
      try {
        const result = isFill
          ? await this.controller.fill(target.selector, value ?? extractQuotedValue(instruction))
          : await this.controller.click(target.selector);

        if (result.success) {
          return {
            success: true,
            action: isFill ? 'fill' : 'click',
            selector: target.selector,
            attempts,
          };
        }
        // Self-heal: selector failed — loop re-observes and retries once more.
        lastError = result.error ?? 'action failed';
      } catch (err) {
        // Adapter threw (e.g. detached/stale node) — self-heal on next attempt.
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return { success: false, action: wantsFill ? 'fill' : 'click', attempts, error: lastError };
  }

  /**
   * Extract structured data. When a zod-compatible schema is provided, the LLM
   * output is validated; a validation failure returns success=false.
   */
  async extract<T = Record<string, unknown>>(
    instruction: string,
    schema?: SchemaLike<T>,
  ): Promise<ExtractResult<T>> {
    const result = await aiExtract<T>(this.controller, instruction, this.page, this.ctx);
    if (!result.success) return { success: false, error: result.error };
    if (!schema) return { success: true, data: result.data };

    const parsed = schema.safeParse(result.data);
    if (parsed.success) return { success: true, data: parsed.data };
    return {
      success: false,
      error: 'Extracted data failed schema validation.',
      validationError: parsed.error,
    };
  }

  private toObserveResult(candidate: PageElementCandidate): ObserveResult {
    const suggestedAction: 'click' | 'fill' =
      candidate.tag === 'input' || candidate.tag === 'textarea' ? 'fill' : 'click';
    const label =
      candidate.text ||
      candidate.attrs['aria-label'] ||
      candidate.attrs.placeholder ||
      candidate.tag;
    return { selector: candidate.selector, description: label, suggestedAction, candidate };
  }
}

/** Pull a quoted value out of an instruction like: type "hello" into search. */
function extractQuotedValue(instruction: string): string {
  const match = instruction.match(/["'“](.+?)["'”]/);
  return match?.[1] ?? '';
}

/**
 * Reduce an instruction to the element it targets for keyword matching:
 * strips leading action verbs, quoted values, and connective words so a
 * no-LLM fallback can match the element's visible text/label.
 * e.g. 'click login' -> 'login'; 'type "x" into email' -> 'email'.
 */
function deriveTargetPhrase(instruction: string): string {
  let phrase = instruction.replace(/["'“”].*?["'“”]/g, ' ');
  phrase = phrase.replace(
    /\b(click|press|tap|type|fill|enter|input|write|paste|select|choose|search for|into|in|on|the|a|an|to|field|button)\b/gi,
    ' ',
  );
  return phrase.replace(/\s+/g, ' ').trim() || instruction;
}
