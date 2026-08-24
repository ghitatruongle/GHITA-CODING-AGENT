// Regression tests for Track 2 fix: cron scheduler minute dedup + timer recreation.
import { describe, expect, it, vi } from 'vitest';
import { CronScheduler } from '../../packages/agents/src/scheduler/cron.js';

function makeScheduler() {
  const assignTask = vi.fn().mockResolvedValue({ id: 't', status: 'completed' });
  const scheduler = new CronScheduler({
    list: () => [{ id: 'agent-1' }],
    assignTask,
  } as never);
  return { scheduler, assignTask };
}

describe('CronScheduler (Track 2 regression)', () => {
  it('fires a matching cron task at most once per minute despite 10s ticks', () => {
    const { scheduler, assignTask } = makeScheduler();
    const now = new Date();
    const expr = `${now.getMinutes()} ${now.getHours()} * * *`;
    scheduler.addTask({ id: 'daily', expression: expr, taskDescription: 'run once' });

    // Simulate three ticks within the same minute.
    (scheduler as unknown as { tick(): void }).tick();
    (scheduler as unknown as { tick(): void }).tick();
    (scheduler as unknown as { tick(): void }).tick();

    expect(assignTask).toHaveBeenCalledTimes(1);
  });

  it('clears stale interval handles on stop so start() recreates them', () => {
    const { scheduler } = makeScheduler();
    scheduler.addTask({ id: 'every-sec', expression: 'every 1 second', taskDescription: 'x' });
    const task = scheduler.getTask('every-sec');
    expect(task?.intervalId).toBeTruthy();

    scheduler.stop();
    // The stale handle must be dropped — a truthy leftover would make tick()
    // skip the task forever after restart.
    expect(task?.intervalId).toBeUndefined();

    scheduler.start();
    expect(task?.intervalId).toBeTruthy(); // recreated by start()
    scheduler.stop();
  });
});
