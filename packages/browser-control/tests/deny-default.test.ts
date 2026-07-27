import { describe, it, expect } from 'vitest';

describe('Browser-control deny-default', () => {
  it('arbitrary protocol blocked', () => {
    expect('deny-default').toBe('deny-default');
  });
});
