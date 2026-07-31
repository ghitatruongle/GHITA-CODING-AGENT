// ==============================================================================
// CommandPalette (v0.7.0) — unit tests for fuzzy matching
// ==============================================================================

import { describe, it, expect } from 'vitest';

// Test the fuzzy matching logic directly (no React needed)
function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  const camelParts = text.replace(/([A-Z])/g, ' $1').split(/\s+/);
  return camelParts.some((p) => p.toLowerCase().includes(q));
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  const camelParts = text.replace(/([A-Z])/g, ' $1').split(/\s+/);
  const matched = camelParts.filter((p) => p.toLowerCase().includes(q));
  if (matched.length > 0) return 50;
  return 10;
}

describe('CommandPalette — fuzzy matching', () => {
  it('matches exact substring', () => {
    expect(fuzzyMatch('code', 'Go to Code')).toBe(true);
  });

  it('matches camelCase split', () => {
    expect(fuzzyMatch('settings', 'Go to Settings')).toBe(true);
  });

  it('returns higher score for prefix matches', () => {
    const prefixScore = fuzzyScore('go to', 'Go to Code');
    const subScore = fuzzyScore('code', 'Go to Code');
    expect(prefixScore).toBeGreaterThanOrEqual(subScore);
  });

  it('returns highest score for exact match', () => {
    expect(fuzzyScore('code', 'code')).toBe(100);
  });

  it('returns minimum score for no match', () => {
    expect(fuzzyScore('xyz', 'code')).toBe(10);
  });
});
