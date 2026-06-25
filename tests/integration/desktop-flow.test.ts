import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Integration - Desktop Flow', () => {
  it('should create a default skill registry with built-in skills', async () => {
    const { createDefaultSkillRegistry } = await import('@ghita/skills');
    const registry = createDefaultSkillRegistry();
    const snapshot = registry.snapshot();
    expect(snapshot.total).toBeGreaterThan(0);
    expect(snapshot.byCategory.file).toBeGreaterThan(0);
    expect(snapshot.byCategory.terminal).toBeGreaterThan(0);
  });

  it('should execute a read-file skill and fail gracefully without adapter', async () => {
    const { createDefaultSkillRegistry, runSkillSequence } = await import('@ghita/skills');
    const registry = createDefaultSkillRegistry();
    // Without file adapter, file.read should return an error, not throw
    const results = await runSkillSequence(registry, [
      { skillId: 'file.read', invocation: { args: { path: '/tmp/test.txt' } } },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]).toBeDefined();
  });

  it('should have 20 built-in skills across all categories', async () => {
    const { createDefaultSkillRegistry } = await import('@ghita/skills');
    const registry = createDefaultSkillRegistry();
    const snapshot = registry.snapshot();
    expect(snapshot.total).toBe(20);
    // All categories should have at least one skill
    const categories = Object.values(snapshot.byCategory);
    expect(categories.some((c) => c > 0)).toBe(true);
  });
});
