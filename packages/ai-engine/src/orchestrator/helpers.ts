/**
 * Compute a stable cache key for a chat history.
 *
 * Uses Web Crypto's SHA-256 over a canonical JSON encoding (object keys
 * are sorted) so that two histories differing only in key order produce
 * the same hash. Falls back to a plain JSON string on environments
 * without `globalThis.crypto.subtle` (older Node test runners).
 */
export async function stableMessageKey(
  messages: ReadonlyArray<{
    role: string;
    content: string | unknown;
    name?: string;
    toolCallId?: string;
  }>,
): Promise<string> {
  const canonical = JSON.stringify(messages, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        out[key] = (v as Record<string, unknown>)[key];
      }
      return out;
    }
    return v;
  });

  // Node 20+ and modern browsers expose globalThis.crypto.subtle
  const subtle = (
    globalThis as {
      crypto?: { subtle?: { digest: (algo: string, data: Uint8Array) => Promise<ArrayBuffer> } };
    }
  ).crypto?.subtle;
  if (subtle) {
    try {
      const enc = new TextEncoder().encode(canonical);
      const digest = await subtle.digest('SHA-256', enc);
      const bytes = new Uint8Array(digest);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `sha256:${hex}`;
    } catch {
      // fall through
    }
  }
  return `plain:${canonical}`;
}
