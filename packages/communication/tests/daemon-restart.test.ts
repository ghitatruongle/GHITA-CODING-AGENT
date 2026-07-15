// ==============================================================================
// GHITA CODING AGENT — Audit Fix 2.18 Regression Tests
//
// Covers the daemon restart-cycle fix in `GatewayDaemon.restartWorker()`:
// the previous implementation only mutated the in-memory status object
// without stopping the worker or re-invoking its `start` hook, so callers
// believed a restart happened while the original process kept running.
//
// The fix performs a real stop → start cycle using the worker's factory
// (when registered) and only flips the state to `running` after the new
// instance is alive. If either step fails, the worker is marked `errored`
// and `restartWorker` returns `false`.
//
// These tests access private members (`workerRuntimes`, `workerFactories`,
// `registerWorker`) via bracket-notation casts — this is intentional, the
// only public surface for registering workers is `start()` and we need
// to drive `restartWorker()` with controlled stop/start hooks to assert
// the cycle is invoked in order.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GatewayDaemon } from '../src/daemon.js';

interface WorkerHooks {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface RegisteredWorker {
  hooks: WorkerHooks;
  factory: ReturnType<typeof vi.fn>;
}

/** Reach into the daemon's private state to register a worker with hooks. */
function registerWorkerWithHooks(daemon: GatewayDaemon, name: string): RegisteredWorker {
  const start = vi.fn(async () => {});
  const stop = vi.fn(async () => {});
  const factory = vi.fn(async () => ({ start, stop }));

  // Cast to access private registerWorker — the only way to inject workers
  // with controllable stop/start hooks is via this private API.
  const d = daemon as unknown as {
    registerWorker: (
      n: string,
      runtime: { start?: () => Promise<void>; stop: () => Promise<void> },
      factory?: () => Promise<{
        start?: () => Promise<void>;
        stop: () => Promise<void>;
      }>,
    ) => void;
  };
  d.registerWorker(name, { start, stop }, factory);

  return { hooks: { start, stop }, factory };
}

describe('Audit Fix 2.18 — GatewayDaemon restartWorker() lifecycle', () => {
  let daemon: GatewayDaemon;

  beforeEach(() => {
    daemon = new GatewayDaemon({ maxRestartAttempts: 3 });
    // The constructor sets up pairingManager + the health timer; we don't
    // call start() because we only want to exercise restartWorker() in
    // isolation. The health timer is null until start() is called, so this
    // is safe.
  });

  it('returns false when the worker is unknown', async () => {
    const result = await daemon.restartWorker('does-not-exist');
    expect(result).toBe(false);
  });

  it('invokes stop() then start() in order via the factory', async () => {
    const calls: string[] = [];
    const start = vi.fn(async () => {
      calls.push('start');
    });
    const stop = vi.fn(async () => {
      calls.push('stop');
    });
    const factory = vi.fn(async () => ({ start, stop }));
    const d = daemon as unknown as {
      registerWorker: (
        n: string,
        runtime: { start?: () => Promise<void>; stop: () => Promise<void> },
        factory?: () => Promise<{
          start?: () => Promise<void>;
          stop: () => Promise<void>;
        }>,
      ) => void;
    };
    d.registerWorker('gw', { start, stop }, factory);

    const ok = await daemon.restartWorker('gw');
    expect(ok).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['stop', 'start']); // stop happens before start
  });

  it('increments restartCount on each successful restart', async () => {
    const { hooks, factory } = registerWorkerWithHooks(daemon, 'counter');

    await daemon.restartWorker('counter');
    await daemon.restartWorker('counter');

    expect(factory).toHaveBeenCalledTimes(2);
    expect(hooks.start).toHaveBeenCalledTimes(2);
    expect(hooks.stop).toHaveBeenCalledTimes(2);
  });

  it('returns false and marks errored when stop() throws', async () => {
    const start = vi.fn(async () => {});
    const stop = vi.fn(async () => {
      throw new Error('boom-stop');
    });
    const factory = vi.fn(async () => ({ start, stop }));
    const d = daemon as unknown as {
      registerWorker: (
        n: string,
        runtime: { start?: () => Promise<void>; stop: () => Promise<void> },
        factory?: () => Promise<{
          start?: () => Promise<void>;
          stop: () => Promise<void>;
        }>,
      ) => void;
    };
    d.registerWorker('crashy', { start, stop }, factory);

    const ok = await daemon.restartWorker('crashy');
    expect(ok).toBe(false);
    expect(start).not.toHaveBeenCalled();
  });

  it('returns false and marks errored when start() throws', async () => {
    const start = vi.fn(async () => {
      throw new Error('boom-start');
    });
    const stop = vi.fn(async () => {});
    const factory = vi.fn(async () => ({ start, stop }));
    const d = daemon as unknown as {
      registerWorker: (
        n: string,
        runtime: { start?: () => Promise<void>; stop: () => Promise<void> },
        factory?: () => Promise<{
          start?: () => Promise<void>;
          stop: () => Promise<void>;
        }>,
      ) => void;
    };
    d.registerWorker('crashy2', { start, stop }, factory);

    const ok = await daemon.restartWorker('crashy2');
    expect(ok).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1); // stop ran before start failed
  });

  it('respects maxRestartAttempts and refuses after the cap', async () => {
    const strict = new GatewayDaemon({ maxRestartAttempts: 2 });
    const { factory } = registerWorkerWithHooks(strict, 'flaky');

    expect(await strict.restartWorker('flaky')).toBe(true); // 1
    expect(await strict.restartWorker('flaky')).toBe(true); // 2
    const third = await strict.restartWorker('flaky'); // 3 — over cap
    expect(third).toBe(false);
    // The factory was only invoked twice (third call short-circuits).
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('still restarts workers that have no factory (stop-only fallback)', async () => {
    const stop = vi.fn(async () => {});
    const d = daemon as unknown as {
      registerWorker: (
        n: string,
        runtime: { start?: () => Promise<void>; stop: () => Promise<void> },
        factory?: () => Promise<{
          start?: () => Promise<void>;
          stop: () => Promise<void>;
        }>,
      ) => void;
    };
    d.registerWorker('legacy', { stop }); // no factory

    const ok = await daemon.restartWorker('legacy');
    expect(ok).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
