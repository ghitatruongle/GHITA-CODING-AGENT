// ==============================================================================
// Instinct Engine Unit Tests
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { InstinctEngine, BUILTIN_INSTINCTS } from '../src/instincts/instinct-engine.js';

describe('InstinctEngine', () => {
  it('should match instincts based on file extension', () => {
    const engine = new InstinctEngine(BUILTIN_INSTINCTS);
    const { activeInstincts, combinedPrompt } = engine.evaluate({
      activeFile: 'src/main.rs',
    });

    expect(activeInstincts.some((rule) => rule.id === 'rust-safety-instinct')).toBe(true);
    expect(combinedPrompt).toContain('RUST INSTINCT');
  });

  it('should match instincts based on prompt keywords', () => {
    const engine = new InstinctEngine(BUILTIN_INSTINCTS);
    const { activeInstincts, combinedPrompt } = engine.evaluate({
      userPrompt: 'Please configure user login password and auth token',
    });

    expect(activeInstincts.some((rule) => rule.id === 'security-audit-instinct')).toBe(true);
    expect(combinedPrompt).toContain('SECURITY INSTINCT');
  });

  it('should register custom instinct rules dynamically', () => {
    const engine = new InstinctEngine([]);
    engine.register({
      id: 'custom-python-instinct',
      name: 'Python PEP8',
      description: 'Enforce type hints and PEP8 formatting in Python files',
      triggers: { fileExtensions: ['.py'] },
      instruction: 'PYTHON INSTINCT: Use type annotations on all function signatures.',
      enabled: true,
      priority: 15,
    });

    const { activeInstincts } = engine.evaluate({ activeFile: 'script.py' });
    expect(activeInstincts).toHaveLength(1);
    expect(activeInstincts[0]?.id).toBe('custom-python-instinct');
  });
});
