import { describe, it, expect } from 'vitest';
import {
  calculateDecayScore,
  getNamespaceOverview,
  getTimeline,
  retrieveEnhanced,
  MemoryFreshnessTracker,
} from '../src/freshness.js';
import type { MemoryEntry } from '@ghita/shared';

describe('Phase 22: memoryFreshness (decay)', () => {
  const halfLife = 24 * 60 * 60 * 1000; // 1 day
  const now = Date.now();

  describe('calculateDecayScore', () => {
    it('should return 1.0 for new memories (age = 0)', () => {
      const score = calculateDecayScore(now, halfLife, now);
      expect(score).toBe(1.0);
    });

    it('should return 0.5 when age equals half-life', () => {
      const timestamp = now - halfLife;
      const score = calculateDecayScore(timestamp, halfLife, now);
      expect(score).toBe(0.5);
    });

    it('should return 0.25 when age equals twice the half-life', () => {
      const timestamp = now - 2 * halfLife;
      const score = calculateDecayScore(timestamp, halfLife, now);
      expect(score).toBe(0.25);
    });

    it('should clamp score to 1.0 for future timestamps or negative ages', () => {
      const score = calculateDecayScore(now + 1000, halfLife, now);
      expect(score).toBe(1.0);
    });

    it('should handle zero or negative half-life gracefully by returning 1.0', () => {
      const score = calculateDecayScore(now - 1000, 0, now);
      expect(score).toBe(1.0);
    });
  });

  describe('getNamespaceOverview', () => {
    it('should group entries by namespace and compute aggregate stats', () => {
      const entries: MemoryEntry[] = [
        {
          id: '1',
          type: 'fact',
          content: 'Fact 1',
          timestamp: now,
          metadata: { namespace: 'facts' },
        },
        {
          id: '2',
          type: 'fact',
          content: 'Fact 2',
          timestamp: now - halfLife,
          metadata: { namespace: 'facts' },
        },
        {
          id: '3',
          type: 'preference',
          content: 'Preference 1',
          timestamp: now - 2 * halfLife,
          metadata: { namespace: 'preferences' },
        },
        {
          id: '4',
          type: 'context',
          content: 'Fallback type namespace',
          timestamp: now,
          // no namespace in metadata, fallback to type
        },
      ];

      const overview = getNamespaceOverview(entries, {
        halfLifeMs: halfLife,
        now,
      });

      expect(overview['facts']).toBeDefined();
      expect(overview['facts']?.count).toBe(2);
      expect(overview['facts']?.averageFreshness).toBeCloseTo(0.75, 5); // (1.0 + 0.5) / 2
      expect(overview['facts']?.newestTimestamp).toBe(now);
      expect(overview['facts']?.oldestTimestamp).toBe(now - halfLife);

      expect(overview['preferences']).toBeDefined();
      expect(overview['preferences']?.count).toBe(1);
      expect(overview['preferences']?.averageFreshness).toBeCloseTo(0.25, 5); // 0.25

      expect(overview['context']).toBeDefined(); // fallback to type
      expect(overview['context']?.count).toBe(1);
    });
  });

  describe('getTimeline', () => {
    const entries: MemoryEntry[] = [
      { id: 'a', type: 'fact', content: 'Oldest', timestamp: now - 3 * halfLife },
      { id: 'b', type: 'fact', content: 'Middle', timestamp: now - halfLife },
      { id: 'c', type: 'fact', content: 'Newest', timestamp: now },
    ];

    it('should return entries sorted descending by default', () => {
      const result = getTimeline(entries, { now });
      expect(result.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    });

    it('should sort ascending when order is set to asc', () => {
      const result = getTimeline(entries, { order: 'asc', now });
      expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('should limit output size', () => {
      const result = getTimeline(entries, { limit: 2, now });
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('c');
      expect(result[1]?.id).toBe('b');
    });

    it('should filter by minFreshness threshold', () => {
      // halfLife decay = 0.5. At 2 * halfLife = 0.25.
      // a: 0.125, b: 0.5, c: 1.0
      const result = getTimeline(entries, {
        minFreshness: 0.4,
        halfLifeMs: halfLife,
        now,
      });
      expect(result.map((r) => r.id)).toEqual(['c', 'b']);
    });

    it('should filter by date ranges', () => {
      const result = getTimeline(entries, {
        afterDate: now - 2 * halfLife,
        beforeDate: now - 500,
        now,
      });
      expect(result.map((r) => r.id)).toEqual(['b']);
    });
  });

  describe('retrieveEnhanced (multi-signal)', () => {
    const entries: MemoryEntry[] = [
      {
        id: 'm1',
        type: 'fact',
        content: 'TypeScript static types compilation',
        timestamp: now,
        relevance: 0.9, // importance
        metadata: {
          vector: [1, 0, 0],
          accessCount: 8, // frequency
        },
      },
      {
        id: 'm2',
        type: 'fact',
        content: 'Python dynamic execution interpreter',
        timestamp: now - halfLife, // recency = 0.5
        relevance: 0.4, // importance
        metadata: {
          vector: [0, 1, 0],
          accessCount: 2, // frequency
        },
      },
    ];

    it('should rank entries using combined weights of multi-signals', () => {
      // Test search with semantic query vector
      const results = retrieveEnhanced(entries, {
        queryVector: [1, 0, 0],
        recencyWeight: 0.4,
        semanticWeight: 0.3,
        importanceWeight: 0.2,
        frequencyWeight: 0.1,
        halfLifeMs: halfLife,
        now,
      });

      expect(results).toHaveLength(2);
      expect(results[0]?.entry.id).toBe('m1');

      // m1 score breakdown:
      // recency: age=0 -> score=1.0 * 0.4 = 0.4
      // semantic: cosine([1,0,0], [1,0,0]) = 1.0 * 0.3 = 0.3
      // importance: relevance=0.9 * 0.2 = 0.18
      // frequency: accessCount=8 -> score=0.8 * 0.1 = 0.08
      // Sum = 0.4 + 0.3 + 0.18 + 0.08 = 0.96
      expect(results[0]?.score).toBeCloseTo(0.96, 5);

      // m2 score breakdown:
      // recency: age=1 day -> score=0.5 * 0.4 = 0.2
      // semantic: cosine([1,0,0], [0,1,0]) = 0.0 * 0.3 = 0
      // importance: relevance=0.4 * 0.2 = 0.08
      // frequency: accessCount=2 -> score=0.2 * 0.1 = 0.02
      // Sum = 0.2 + 0.08 + 0.02 = 0.3
      expect(results[1]?.score).toBeCloseTo(0.3, 5);
    });

    it('should fallback to keyword token overlap matching when queryVector is missing', () => {
      const results = retrieveEnhanced(entries, {
        query: 'TypeScript types',
        recencyWeight: 0.4,
        semanticWeight: 0.3,
        importanceWeight: 0.2,
        frequencyWeight: 0.1,
        halfLifeMs: halfLife,
        now,
      });

      expect(results).toHaveLength(2);
      // m1 matches tokens: 'typescript' and 'types' out of query tokens -> 2/2 = 1.0 similarity
      expect(results[0]?.entry.id).toBe('m1');
      expect(results[0]?.score).toBeCloseTo(0.96, 2);

      // m2 matches 0 tokens -> 0.0 similarity
      expect(results[1]?.entry.id).toBe('m2');
      expect(results[1]?.score).toBeCloseTo(0.3, 2);
    });

    it('should respect minScore threshold', () => {
      const results = retrieveEnhanced(entries, {
        queryVector: [1, 0, 0],
        minScore: 0.5,
        halfLifeMs: halfLife,
        now,
      });
      expect(results).toHaveLength(1);
      expect(results[0]?.entry.id).toBe('m1');
    });
  });

  describe('MemoryFreshnessTracker Class Wrapper', () => {
    it('should initialize and provide same utilities via instance methods', () => {
      const tracker = new MemoryFreshnessTracker({
        halfLifeMs: halfLife,
        namespaceHalfLifes: { custom: halfLife * 2 },
      });

      // calculateDecayScore
      expect(tracker.calculateDecayScore(now - halfLife, now)).toBe(0.5);

      // getNamespaceOverview
      const entries: MemoryEntry[] = [
        { id: '1', type: 'fact', content: 'c1', timestamp: now - halfLife, metadata: { namespace: 'custom' } },
      ];
      const overview = tracker.getNamespaceOverview(entries, now);
      // For custom namespace, halfLife is double (2 days). Age is 1 day. Freshness should be 2 ^ (-1/2) = ~0.707
      expect(overview['custom']?.averageFreshness).toBeCloseTo(Math.SQRT1_2, 5);

      // getTimeline
      const timeline = tracker.getTimeline(entries, { minFreshness: 0.8, now });
      expect(timeline).toHaveLength(0); // 0.707 < 0.8
    });
  });
});
