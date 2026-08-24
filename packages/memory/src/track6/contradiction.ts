// Detects conflicting memories (via polarity + semantic similarity with an
// injectable embedder) and resolves them by superseding the older entry.

export interface MemoryText {
  id: string;
  text: string;
  at: number;
  /** e.g. "fact", "preference", "session". */
  type?: string;
}

export type ResolutionAction = 'supersede' | 'revise' | 'keep';

export interface ContradictionResult {
  conflicting: boolean;
  action: ResolutionAction;
  confidence: number;
  reason: string;
}

export interface Embedder {
  (text: string): Promise<number[]>;
}

export interface ContradictionDetectorOptions {
  /** Similarity threshold above which texts are compared for polarity (default 0.8). */
  similarityThreshold?: number;
  /** Polarity words marking opposite claims. */
  polarityPairs?: Array<[RegExp, RegExp]>;
}

const DEFAULT_POLARITY_PAIRS: Array<[RegExp, RegExp]> = [
  [/true|yes|supports|likes|enabled/i, /false|no|rejects|dislikes|disabled/i],
  [/works|fixed|solved/i, /broken|fails|unsolved/i],
  [/windows/i, /macos|linux/i],
];

/** Lightweight cosine similarity for embedding fallback. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export class ContradictionDetector {
  private readonly threshold: number;
  private readonly pairs: Array<[RegExp, RegExp]>;

  constructor(options: ContradictionDetectorOptions = {}) {
    this.threshold = options.similarityThreshold ?? 0.8;
    this.pairs = options.polarityPairs ?? DEFAULT_POLARITY_PAIRS;
  }

  /** Check whether `newEntry` contradicts `existing`. */
  async detect(
    existing: MemoryText,
    newEntry: MemoryText,
    embedder?: Embedder,
  ): Promise<ContradictionResult> {
    if (!existing.text || !newEntry.text) {
      return { conflicting: false, action: 'keep', confidence: 0, reason: 'empty text' };
    }
    const sameTopic = await this.sameTopic(existing.text, newEntry.text, embedder);
    if (!sameTopic) {
      return { conflicting: false, action: 'keep', confidence: 0, reason: 'different topics' };
    }
    const polarity = this.polarityConflict(existing.text, newEntry.text);
    if (!polarity.conflicting) {
      return { conflicting: false, action: 'keep', confidence: 0, reason: 'no polarity conflict' };
    }
    // Newer entry supersedes the older one.
    const action: ResolutionAction = newEntry.at >= existing.at ? 'supersede' : 'revise';
    return {
      conflicting: true,
      action,
      confidence: polarity.confidence,
      reason: `polarity conflict detected (${polarity.left} vs ${polarity.right})`,
    };
  }

  private async sameTopic(a: string, b: string, embedder?: Embedder): Promise<boolean> {
    if (!embedder) {
      // Lexical fallback: overlapping significant tokens.
      const tokensA = tokenize(a);
      const tokensB = tokenize(b);
      const overlap = [...tokensA].filter((t) => tokensB.has(t)).length;
      const min = Math.min(tokensA.size, tokensB.size);
      return min > 0 && overlap / min >= 0.4;
    }
    return cosine(await embedder(a), await embedder(b)) >= this.threshold;
  }

  private polarityConflict(
    a: string,
    b: string,
  ): { conflicting: boolean; confidence: number; left?: string; right?: string } {
    for (const [leftRe, rightRe] of this.pairs) {
      const leftHit = leftRe.test(a) && rightRe.test(b);
      const rightHit = rightRe.test(a) && leftRe.test(b);
      if (leftHit || rightHit) {
        return { conflicting: true, confidence: 0.9, left: 'left-claim', right: 'opposite-claim' };
      }
    }
    return { conflicting: false, confidence: 0 };
  }
}

/** Tracks superseded memory ids for audit + rollback. */
export class SupersedeTracker {
  private readonly relations = new Map<string, string>(); // newId → oldId

  record(newId: string, supersededId: string): void {
    this.relations.set(newId, supersededId);
  }

  supersededBy(newId: string): string | undefined {
    return this.relations.get(newId);
  }

  /** Chain back to the original version. */
  origin(newId: string): string {
    let current = newId;
    for (let depth = 0; depth < 32; depth++) {
      const prev = this.relations.get(current);
      if (!prev) return current;
      current = prev;
    }
    return current;
  }

  all(): Array<{ newId: string; supersededId: string }> {
    return [...this.relations.entries()].map(([newId, supersededId]) => ({ newId, supersededId }));
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 2),
  );
}
