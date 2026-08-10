import { describe, it } from 'vitest';
import fc from 'fast-check';
import { parseToolArguments, repairToolCallArguments, isRetryableRepair } from './repair.js';

// ==============================================================================
// v1.1.0 Track 11 F5 — property tests cho tool-call repair (fast-check)
// ==============================================================================

describe('repairToolCallArguments property tests', () => {
  it('never throws on arbitrary input and always returns an args object', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const result = repairToolCallArguments(raw, {
          type: 'object',
          properties: { path: { type: 'string' }, limit: { type: 'number' } },
          required: ['path'],
        });
        return (
          result.args !== null &&
          typeof result.args === 'object' &&
          !Array.isArray(result.args) &&
          typeof result.repaired === 'boolean' &&
          Array.isArray(result.issues)
        );
      }),
      { numRuns: 300 },
    );
  });

  it('round-trips valid JSON object strings unchanged (no repair)', () => {
    fc.assert(
      fc.property(fc.object({ maxDepth: 3 }), (obj) => {
        const result = parseToolArguments(JSON.stringify(obj));
        return result.issues.length === 0 && JSON.stringify(result.args) === JSON.stringify(obj);
      }),
      { numRuns: 200 },
    );
  });

  it('repair keeps valid calls retryable', () => {
    fc.assert(
      fc.property(fc.object({ maxDepth: 2 }), fc.boolean(), (obj, withSchema) => {
        const result = repairToolCallArguments(
          obj,
          withSchema ? { type: 'object', properties: {}, required: [] } : undefined,
        );
        return isRetryableRepair(result);
      }),
      { numRuns: 200 },
    );
  });

  it('coerces primitive args per schema deterministically', () => {
    fc.assert(
      fc.property(fc.integer(), fc.string(), (n, s) => {
        const schema = {
          type: 'object',
          properties: { count: { type: 'number' }, name: { type: 'string' } },
          required: ['count'],
        };
        const r1 = repairToolCallArguments({ count: String(n), name: s }, schema);
        const r2 = repairToolCallArguments({ count: String(n), name: s }, schema);
        return JSON.stringify(r1.args) === JSON.stringify(r2.args) && r1.args.count === n;
      }),
      { numRuns: 200 },
    );
  });
});
