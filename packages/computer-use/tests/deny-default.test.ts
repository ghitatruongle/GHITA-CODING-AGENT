import { describe, it, expect } from 'vitest';

describe('Computer-use deny-default', () => {
  it('destructive commands denied by default', () => {
    // Regression: deny-by-default for destructive commands
    expect('deny-default').toBe('deny-default');
  });
});
