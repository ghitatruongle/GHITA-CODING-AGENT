// ==============================================================================
// GHITA CODING AGENT — DocsGriller Utilities
// ==============================================================================
// Text processing and vector math utilities for the grill-me system.
// Extracted from docsGriller.ts for reuse and testability.
// ==============================================================================

/** Tokenize text into lowercase words, removing punctuation */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(
      /[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ_\s-]/g,
      ' ',
    )
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Build a simple TF (term frequency) vector from tokens */
export function buildVector(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  // Normalize by total token count
  const total = tokens.length || 1;
  for (const [k, v] of freq) {
    freq.set(k, v / total);
  }
  return freq;
}

/** Cosine similarity between two sparse vectors */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [k, va] of a) {
    normA += va * va;
    const vb = b.get(k);
    if (vb !== undefined) dot += va * vb;
  }
  for (const vb of b.values()) {
    normB += vb * vb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Extract key sentences containing a keyword */
export function extractExcerpt(content: string, keyword: string, contextLines = 2): string {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.toLowerCase().includes(keyword.toLowerCase())) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length, i + contextLines + 1);
      return lines.slice(start, end).join('\n').trim();
    }
  }
  // Fallback: first 200 chars
  return `${content.slice(0, 200).trim()  }...`;
}
