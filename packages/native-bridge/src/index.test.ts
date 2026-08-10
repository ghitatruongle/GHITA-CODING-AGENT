import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadNative, registerNative, isAddonBuilt, addonCandidates } from './index.js';

afterEach(() => vi.restoreAllMocks());

describe('loadNative', () => {
  it('returns the JS fallback when the addon is not built', () => {
    const fallback = { scan: () => 'js' };
    const result = loadNative('nonexistent-crate-xyz', fallback);
    expect(result.native).toBe(false);
    expect(result.impl).toBe(fallback);
    expect(result.fallbackReason).toContain('not built');
  });

  it('returns a registered native module', () => {
    const native = { scan: () => 'native' };
    registerNative('secscan', native);
    const result = loadNative('secscan', { scan: () => 'js' });
    expect(result.native).toBe(true);
    expect(result.impl).toBe(native);
  });

  it('candidate paths point into crates/', () => {
    const candidates = addonCandidates('retrieval');
    expect(candidates.some((c) => c.includes('crates') && c.includes('retrieval'))).toBe(true);
    expect(isAddonBuilt('definitely-not-built-crate-xyz')).toBe(false);
  });
});
