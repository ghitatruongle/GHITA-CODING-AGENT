import { describe, it, expect } from 'vitest';
import { runAgentWorkflow } from './run.mjs';

describe('agent-workflow example', () => {
  it('runs fake tool then finishes', async () => {
    const result = await runAgentWorkflow();
    expect(result.finished).toBe(true);
    expect(result.steps[0]?.observation).toBe('echo:hello');
    expect(result.output).toMatch(/complete/);
  });
});
