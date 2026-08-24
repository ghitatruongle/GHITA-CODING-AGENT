import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorGrouper } from './error-grouper.js';
import type { CapturedError } from './types.js';

function makeError(
  overrides: Partial<CapturedError> & { id: string; fingerprint: string },
): CapturedError {
  return {
    type: 'Error',
    message: 'Something went wrong',
    severity: 'error',
    timestamp: Date.now(),
    context: {},
    ...overrides,
  };
}

describe('ErrorGrouper', () => {
  let grouper: ErrorGrouper;

  beforeEach(() => {
    grouper = new ErrorGrouper();
  });

  it('should start empty', () => {
    expect(grouper.list()).toHaveLength(0);
  });

  it('should ingest error events', () => {
    const event = makeError({ id: 'e1', fingerprint: 'fp1' });
    grouper.ingest(event);
    expect(grouper.list()).toHaveLength(1);
  });

  it('should group errors with same fingerprint', () => {
    grouper.ingest(makeError({ id: 'e1', fingerprint: 'fp1' }));
    grouper.ingest(makeError({ id: 'e2', fingerprint: 'fp1' }));
    const groups = grouper.list();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(2);
  });

  it('should create separate groups for different fingerprints', () => {
    grouper.ingest(makeError({ id: 'e1', fingerprint: 'fp1' }));
    grouper.ingest(makeError({ id: 'e2', fingerprint: 'fp2' }));
    expect(grouper.list()).toHaveLength(2);
  });

  it('should retrieve a group by fingerprint', () => {
    const event = makeError({ id: 'e1', fingerprint: 'fp1' });
    grouper.ingest(event);
    const group = grouper.get('fp1');
    expect(group).toBeDefined();
    expect(group?.fingerprint).toBe('fp1');
  });

  it('should return undefined for unknown fingerprint', () => {
    expect(grouper.get('unknown')).toBeUndefined();
  });

  it('should return top-N groups by count', () => {
    grouper.ingest(makeError({ id: 'e1', fingerprint: 'common' }));
    grouper.ingest(makeError({ id: 'e2', fingerprint: 'common' }));
    grouper.ingest(makeError({ id: 'e3', fingerprint: 'rare' }));
    const top = grouper.top(1);
    expect(top).toHaveLength(1);
    expect(top[0]?.count).toBe(2);
  });

  it('should forget a group', () => {
    grouper.ingest(makeError({ id: 'e1', fingerprint: 'fp1' }));
    grouper.forget('fp1');
    expect(grouper.list()).toHaveLength(0);
  });

  it('should report stats', () => {
    grouper.ingest(makeError({ id: 'e1', fingerprint: 'fp1', context: { userId: 'user1' } }));
    grouper.ingest(makeError({ id: 'e2', fingerprint: 'fp1' }));
    grouper.ingest(makeError({ id: 'e3', fingerprint: 'fp2' }));
    const stats = grouper.stats();
    expect(stats.totalErrors).toBe(3);
    expect(stats.groupCount).toBe(2);
    expect(stats.uniqueUsers).toBe(1);
  });

  it('should clear all groups', () => {
    grouper.ingest(makeError({ id: 'e1', fingerprint: 'fp1' }));
    grouper.clear();
    expect(grouper.list()).toHaveLength(0);
  });
});
