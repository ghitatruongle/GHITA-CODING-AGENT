import { describe, it, expect } from 'vitest';

describe('Agent subagent isolation', () => {
  it('subagent index exports module', async () => {
    const mod = await import('../src/subagent/index');
    expect(mod).toBeDefined();
  });
});
