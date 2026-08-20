// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 6.2: PreCompact Re-injection
// ------------------------------------------------------------------------------
// Hook that runs before memory compaction to inject relevant memories into
// the context window. This ensures that after compaction, the agent can still
// answer questions requiring facts from older entries that were compacted away.
//
// Pattern: agentmemory PreCompact re-injection.
// ==============================================================================

export interface PreCompactContext {
  /** Current messages in the conversation. */
  messages: Array<{ role: string; content: string }>;
  /** Memories available for injection. */
  availableMemories: Array<{
    id: string;
    content: string;
    type: string;
    timestamp: number;
    relevance?: number;
  }>;
  /** Maximum characters to inject (default: 2000). */
  maxInjectChars?: number;
  /** Maximum number of memories to inject (default: 10). */
  maxMemories?: number;
}

export interface PreCompactResult {
  /** Memories selected for injection. */
  injected: Array<{ id: string; content: string; type: string }>;
  /** Total characters injected. */
  totalChars: number;
  /** The injection text to prepend to context. */
  injectionText: string;
}

/**
 * Select and format memories for pre-compact injection.
 * Prioritizes by relevance score, then recency.
 */
export function selectForInjection(ctx: PreCompactContext): PreCompactResult {
  const maxChars = ctx.maxInjectChars ?? 2000;
  const maxMems = ctx.maxMemories ?? 10;

  // Extract keywords from recent messages for relevance scoring
  const recentContent = ctx.messages
    .slice(-5)
    .map((m) => m.content)
    .join(' ');
  const keywords = extractKeywords(recentContent);

  // Score memories by keyword overlap + recency
  const scored = ctx.availableMemories.map((mem) => {
    let keywordScore = 0;
    const memLower = mem.content.toLowerCase();
    for (const kw of keywords) {
      if (memLower.includes(kw)) keywordScore += 1;
    }
    const recencyScore = mem.timestamp / Date.now();
    const explicitRelevance = mem.relevance ?? 0;
    const composite = keywordScore * 0.5 + recencyScore * 0.2 + explicitRelevance * 0.3;
    return { ...mem, composite };
  });

  // Sort by composite score descending
  scored.sort((a, b) => b.composite - a.composite);

  // Select top memories within budget
  const injected: Array<{ id: string; content: string; type: string }> = [];
  let totalChars = 0;

  for (const mem of scored) {
    if (injected.length >= maxMems) break;
    const entryChars = mem.content.length + 20; // overhead for formatting
    if (totalChars + entryChars > maxChars) break;
    injected.push({ id: mem.id, content: mem.content, type: mem.type });
    totalChars += entryChars;
  }

  // Format injection text
  const lines = ['[Retrieved Memory Context]'];
  for (const mem of injected) {
    lines.push(`- [${mem.type}] ${mem.content}`);
  }
  const injectionText = injected.length > 0 ? lines.join('\n') : '';

  return { injected, totalChars, injectionText };
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // Simple frequency-based extraction
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}
