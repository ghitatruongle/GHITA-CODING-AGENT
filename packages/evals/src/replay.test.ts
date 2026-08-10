import { describe, it, expect } from 'vitest';
import { replayOffline, replayTrajectory } from './replay.js';

describe('replayOffline', () => {
  it('replays steps with recorded answers', async () => {
    const run = { steps: [{ tool: 'grep_search' }, { tool: 'write_file' }] };
    const result = replayOffline(run, new Map([['grep_search', 'found x']]));
    expect(result.ok).toBe(false); // write_file has no answer
    expect(result.steps).toHaveLength(1);
    expect(result.errors[0]).toContain('write_file');
  });
});

describe('replayTrajectory', () => {
  it('executes handler per step and reports errors', async () => {
    const result = await replayTrajectory(
      { steps: [{ tool: 'grep_search' }, { tool: 'boom' }] },
      async (step) => {
        if (step.tool === 'boom') throw new Error('boom');
        return 'ok';
      },
    );
    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.errors[0]).toContain('boom');
  });

  it('succeeds when all steps pass', async () => {
    const result = await replayTrajectory(
      { steps: [{ tool: 'grep_search' }, { tool: 'write_file' }] },
      async () => 'ok',
    );
    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(2);
  });
});
