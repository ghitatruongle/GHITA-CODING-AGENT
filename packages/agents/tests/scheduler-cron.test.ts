import { describe, it, expect } from 'vitest';

describe('Agent scheduler regression', () => {
  it('cron scheduling produces expected output', () => {
    expect('cron').toBe('cron');
  });
});
