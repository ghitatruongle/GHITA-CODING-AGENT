import { describe, it, expect } from 'vitest';

describe('Skills - Registry', () => {
  it('should register and retrieve a skill', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    const registry = new SkillRegistry();
    const testSkill = {
      id: 'test-skill',
      name: 'Test',
      category: 'file' as const,
      description: 'A test skill',
      enabled: true,
      status: 'ready' as const,
      run: async () => ({ success: true, data: 'ok' }),
    };
    registry.register(testSkill);
    expect(registry.get('test-skill')).toBeDefined();
    expect(registry.list()).toHaveLength(1);
  });

  it('should not register duplicate skills', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    const registry = new SkillRegistry();
    const skill = {
      id: 'dup',
      name: 'Dup',
      category: 'file' as const,
      description: '',
      enabled: true,
      status: 'ready' as const,
      run: async () => ({ success: true }),
    };
    registry.register(skill);
    expect(() => registry.register(skill)).toThrow('already registered');
  });

  it('should create session-scoped fork', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    const registry = new SkillRegistry();
    registry.register({
      id: 'skill-a',
      name: 'A',
      category: 'terminal' as const,
      description: '',
      enabled: true,
      status: 'ready' as const,
      run: async () => ({ success: true }),
    });
    const session = registry.fork('session-1');
    session.setEnabled('skill-a', false);
    const s = session.get('skill-a');
    expect(s?.enabled).toBe(false);
    // Original registry unaffected
    expect(registry.get('skill-a')?.enabled).toBe(true);
  });

  it('should list skills sorted by category order', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    const registry = new SkillRegistry();
    registry.register({
      id: 'screenshot-skill',
      name: 'Screenshot',
      category: 'screenshot' as const,
      description: '',
      enabled: true,
      status: 'ready' as const,
      run: async () => ({ success: true }),
    });
    registry.register({
      id: 'file-skill',
      name: 'File Read',
      category: 'file' as const,
      description: '',
      enabled: true,
      status: 'ready' as const,
      run: async () => ({ success: true }),
    });
    const skills = registry.list();
    // file comes before screenshot in CATEGORY_ORDER
    const fileIdx = skills.findIndex((s) => s.id === 'file-skill');
    const screenshotIdx = skills.findIndex((s) => s.id === 'screenshot-skill');
    expect(fileIdx).toBeLessThan(screenshotIdx);
  });

  it('should run a skill and return result', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    const registry = new SkillRegistry();
    registry.register({
      id: 'hello',
      name: 'Hello',
      category: 'app' as const,
      description: '',
      enabled: true,
      status: 'ready' as const,
      run: async () => ({ success: true, data: 'world' }),
    });
    const result = await registry.run('hello');
    expect(result.success).toBe(true);
    expect(result.data).toBe('world');
  });

  it('should not run disabled skills', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    const registry = new SkillRegistry();
    registry.register({
      id: 'disabled-skill',
      name: 'Disabled',
      category: 'file' as const,
      description: '',
      enabled: false,
      status: 'disabled' as const,
      run: async () => ({ success: true }),
    });
    const result = await registry.run('disabled-skill');
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  });

  it('should return error for unknown skill', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    const registry = new SkillRegistry();
    const result = await registry.run('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should call onSkillComplete adapter after run', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    let called = false;
    const registry = new SkillRegistry({
      onSkillComplete: async (id) => {
        called = true;
      },
    });
    registry.register({
      id: 'test-adapter',
      name: 'Test',
      category: 'app' as const,
      description: '',
      enabled: true,
      status: 'ready' as const,
      run: async () => ({ success: true }),
    });
    await registry.run('test-adapter');
    expect(called).toBe(true);
  });

  it('should subscribe to registry changes', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    const registry = new SkillRegistry();
    let snapshotCount = 0;
    registry.subscribe(() => {
      snapshotCount++;
    });
    registry.register({
      id: 'sub-test',
      name: 'Sub Test',
      category: 'file' as const,
      description: '',
      enabled: true,
      status: 'ready' as const,
      run: async () => ({ success: true }),
    });
    // subscribe calls handler immediately + on register
    expect(snapshotCount).toBeGreaterThanOrEqual(1);
  });

  it('should unregister a skill', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    const registry = new SkillRegistry();
    registry.register({
      id: 'to-remove',
      name: 'Remove',
      category: 'file' as const,
      description: '',
      enabled: true,
      status: 'ready' as const,
      run: async () => ({ success: true }),
    });
    expect(registry.list()).toHaveLength(1);
    registry.unregister('to-remove');
    expect(registry.list()).toHaveLength(0);
  });

  it('should provide snapshot stats', async () => {
    const { SkillRegistry } = await import('@ghita/skills');
    const registry = new SkillRegistry();
    const snap = registry.snapshot();
    expect(snap.total).toBe(0);
    expect(snap.enabled).toBe(0);
    expect(snap.disabled).toBe(0);
  });
});
