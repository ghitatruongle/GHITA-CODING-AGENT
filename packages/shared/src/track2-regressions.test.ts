// Regression tests for Track 2 fixes: shared retry classification + backoff.
import { describe, expect, it } from 'vitest';
import { retry } from './utils.js';

describe('retry (Track 2 regression)', () => {
  it('does not retry non-retryable errors (auth failures fail fast)', async () => {
    let calls = 0;
    await expect(
      retry(
        () => {
          calls++;
          return Promise.reject(new Error('401 Unauthorized: bad api key'));
        },
        5,
        1,
      ),
    ).rejects.toThrow('Unauthorized');
    expect(calls).toBe(1);
  });

  it('retries retryable errors with exponential backoff until success', async () => {
    let calls = 0;
    const result = await retry(
      () => {
        calls++;
        if (calls < 3) return Promise.reject(new Error('503 service unavailable'));
        return Promise.resolve('ok');
      },
      5,
      1,
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });
});
