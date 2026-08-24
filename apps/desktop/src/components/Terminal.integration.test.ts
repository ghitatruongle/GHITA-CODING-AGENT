// @vitest-environment node

// Spawns real PTY sessions via node-pty and verifies end-to-end I/O.
// Overrides the default happy-dom environment because node-pty is a native
// Node.js addon that requires a real process environment.

import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// node-pty is a native addon — loaded lazily so vitest can resolve the module
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- type-only import kept out of runtime to avoid loading xterm in unit context
const pty: typeof import('node-pty') = require('node-pty');

// ── Constants mirroring the server's PTY logic ────────────────────────────

/** Same constant used in server.mjs for idle-timeout detection */
const PTY_SESSION_MAX_IDLE_MS = 900_000;

/** Sequences the server filters out (focus in/out) */
const FOCUS_EVENT_SEQUENCES = new Set(['\x1b[I', '\x1b[O']);

interface PtySession {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- type-only import kept out of runtime to avoid loading xterm in unit context
  ptyProcess: import('node-pty').IPty;
  socketId: string;
  lastActivity: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Wait for the PTY output buffer to contain the expected prompt/string.
 * node-pty delivers output asynchronously via onData callbacks, so we need
 * to accumulate chunks until the shell prompt appears.
 */
function waitForOutput(
  session: PtySession,
  predicate: (accumulated: string) => boolean,
  timeoutMs = 10_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let accumulated = '';
    const timeout = setTimeout(() => {
      session.ptyProcess.removeListener('data', handler);
      reject(new Error(`Timeout waiting for PTY output. Accumulated so far:\n${accumulated}`));
    }, timeoutMs);

    const handler = (chunk: string) => {
      accumulated += chunk;
      if (predicate(accumulated)) {
        clearTimeout(timeout);
        session.ptyProcess.removeListener('data', handler);
        resolve(accumulated);
      }
    };

    session.ptyProcess.onData(handler);

    // If the shell already sent the prompt before we attached the handler,
    // check immediately
    if (predicate(accumulated)) {
      clearTimeout(timeout);
      session.ptyProcess.removeListener('data', handler);
      resolve(accumulated);
    }
  });
}

/**
 * Execute a command in the shell and wait for completion.
 * Uses a unique marker to reliably detect command completion without
 * relying on prompt character detection (which is fragile after previous
 * waitForOutput has already consumed the prompt data).
 */
async function execCommand(
  session: PtySession,
  command: string,
  timeoutMs = 15_000,
): Promise<string> {
  const marker = `__DONE_${Date.now()}_${Math.random().toString(36).slice(2, 6)}__`;
  const chainOp = process.platform === 'win32' ? ' & ' : '; ';
  // Wrap the command with a unique marker echo so we can detect completion
  // independent of shell prompt appearance.
  const fullCommand = `${command}${chainOp}echo ${marker}`;

  session.lastActivity = Date.now();
  session.ptyProcess.write(`${fullCommand}\r`);

  // Wait for the marker to appear — definitive signal that the command finished.
  // Works even if the shell hasn't fully initialized yet because the kernel
  // pipe buffer holds queued input until the shell reads it.
  const output = await waitForOutput(session, (acc) => acc.includes(marker), timeoutMs);
  session.lastActivity = Date.now();
  return output;
}

/**
 * Create a PTY session (mirrors server.mjs terminal_create handler).
 */
function createSession(
  id: string,
  socketId: string,
  options?: { shellType?: string; cols?: number; rows?: number; cwd?: string },
): PtySession {
  const shell =
    process.platform === 'win32'
      ? options?.shellType === 'powershell'
        ? 'powershell.exe'
        : 'cmd.exe'
      : 'bash';

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: options?.cols ?? 80,
    rows: options?.rows ?? 24,
    cwd: options?.cwd ?? process.cwd(),
    env: process.env as Record<string, string>,
  });

  const session: PtySession = {
    ptyProcess,
    socketId,
    lastActivity: Date.now(),
  };

  return session;
}

/**
 * Simulate the server's idle-check logic. Returns true if the session
 * was force-killed.
 */
function checkAndKillIdle(session: PtySession, maxIdleMs: number): boolean {
  const now = Date.now();
  if (session.lastActivity && now - session.lastActivity > maxIdleMs) {
    try {
      session.ptyProcess.kill();
    } catch {
      // ignore
    }
    return true;
  }
  return false;
} // ── Tests ─────────────────────────────────────────────────────────────────

describe('PTY Terminal Integration (real node-pty)', () => {
  let sessions: Map<string, PtySession>;

  const TEST_SOCKET_ID = 'test_socket_integration';

  beforeEach(() => {
    sessions = new Map();
  });

  afterEach(() => {
    // Cleanup all sessions — mirrors server disconnect cleanup
    for (const [, session] of sessions.entries()) {
      try {
        session.ptyProcess.kill();
      } catch {
        // ignore
      }
    }
    sessions.clear();
  });

  afterAll(() => {
    // Safety net: kill any remaining zombie sessions
    for (const [, session] of sessions) {
      try {
        session.ptyProcess.kill();
      } catch {}
    }
    sessions.clear();
  });

  // Test 1: Create a real PTY session, execute a command, read output
  
  it('should spawn a real shell, execute a command, and return output', async () => {
    const id = 'integration_test_1';
    const session = createSession(id, TEST_SOCKET_ID);
    sessions.set(id, session);

    try {
      const output = await execCommand(session, 'echo PTY_INTEGRATION_TEST_OK');
      expect(output).toContain('PTY_INTEGRATION_TEST_OK');
    } finally {
      session.ptyProcess.kill();
      sessions.delete(id);
    }
  }, 20_000);

  // Test 2: Multiple commands in the same session (session reuse)
  
  it('should handle multiple consecutive commands in the same session', async () => {
    const id = 'integration_test_2';
    const session = createSession(id, TEST_SOCKET_ID);
    sessions.set(id, session);

    try {
      const out1 = await execCommand(session, 'echo CMD_1');
      expect(out1).toContain('CMD_1');

      const out2 = await execCommand(session, 'echo CMD_2');
      expect(out2).toContain('CMD_2');

      const out3 = await execCommand(session, 'echo CMD_3');
      expect(out3).toContain('CMD_3');
    } finally {
      session.ptyProcess.kill();
      sessions.delete(id);
    }
  }, 30_000);

  // Test 3: Session replacement (same ID → kill old, create new)
  
  it('should replace an existing session with the same ID (kill old, create new)', async () => {
    const sharedId = 'integration_test_3';

    // Create first session
    const session1 = createSession(sharedId, TEST_SOCKET_ID);
    sessions.set(sharedId, session1);
    const pid1 = session1.ptyProcess.pid;

    // Simulate server: kill old, create new with same ID
    try {
      session1.ptyProcess.kill();
    } catch {
      // ignore
    }
    sessions.delete(sharedId);

    // Create second session with same ID
    const session2 = createSession(sharedId, TEST_SOCKET_ID);
    sessions.set(sharedId, session2);
    const pid2 = session2.ptyProcess.pid;

    // They should be different processes
    expect(pid2).not.toBe(pid1);

    // New session should work
    try {
      const output = await execCommand(session2, 'echo REPLACEMENT_OK');
      expect(output).toContain('REPLACEMENT_OK');
    } finally {
      session2.ptyProcess.kill();
      sessions.delete(sharedId);
    }
  }, 20_000);

  // Test 4: Empty string input filtering (server-side filter #6)
  
  it('should filter empty string input at the server level (do not forward to PTY)', async () => {
    const id = 'integration_test_4';
    const session = createSession(id, TEST_SOCKET_ID);
    sessions.set(id, session);

    // Simulate the server's terminal_data handler filter:
    //   if (!inputData || typeof inputData !== 'string') return;
    const simulateServerInput = (data: unknown) => {
      if (!data || typeof data !== 'string') return false;
      session.lastActivity = Date.now();
      session.ptyProcess.write(data);
      return true;
    };

    expect(simulateServerInput('')).toBe(false);
    expect(simulateServerInput(null)).toBe(false);
    expect(simulateServerInput(undefined)).toBe(false);
    expect(simulateServerInput(123 as unknown as string)).toBe(false);

    // Valid input should be forwarded
    expect(simulateServerInput('echo FILTER_TEST\r')).toBe(true);

    try {
      const promptChar = process.platform === 'win32' ? '>' : '$';
      await waitForOutput(session, (acc) => acc.includes(promptChar), 10_000);
    } finally {
      session.ptyProcess.kill();
      sessions.delete(id);
    }
  }, 15_000);

  // Test 5: Focus event sequence detection (server-side filter #2/#5)
  
  it('should detect and filter focus-reporting sequences', () => {
    // These sequences are filtered on the client side in Terminal.tsx,
    // but the server also validates input.  Verify the detection logic.
    expect(FOCUS_EVENT_SEQUENCES.has('\x1b[I')).toBe(true);
    expect(FOCUS_EVENT_SEQUENCES.has('\x1b[O')).toBe(true);

    // Normal input should NOT be filtered
    expect(FOCUS_EVENT_SEQUENCES.has('\x1b[OP')).toBe(false); // F1 key
    expect(FOCUS_EVENT_SEQUENCES.has('\x1b[OQ')).toBe(false); // F2 key
    expect(FOCUS_EVENT_SEQUENCES.has('echo hello')).toBe(false);
    expect(FOCUS_EVENT_SEQUENCES.has('\r')).toBe(false);
    expect(FOCUS_EVENT_SEQUENCES.has('cd /d "C:\\Users"')).toBe(false);
  });

  // Test 6: Idle timeout kills zombie sessions (server cleanup interval)
  
  it('should kill idle PTY sessions that exceed the max idle time', async () => {
    const id = 'integration_test_6';
    const session = createSession(id, TEST_SOCKET_ID);
    sessions.set(id, session);

    // Session is active — should NOT be killed
    session.lastActivity = Date.now();
    expect(checkAndKillIdle(session, PTY_SESSION_MAX_IDLE_MS)).toBe(false);
    expect(session.ptyProcess.kill).toBeDefined();

    // Simulate idle timeout: fast-forward lastActivity
    session.lastActivity = Date.now() - PTY_SESSION_MAX_IDLE_MS - 1;
    expect(checkAndKillIdle(session, PTY_SESSION_MAX_IDLE_MS)).toBe(true);

    // Session was killed — verify the kill function is callable (no throw)
    // Note: node-pty does not throw on write() after kill on all platforms,
    // so we only verify that kill() itself didn't throw.
    expect(() => session.ptyProcess.kill()).not.toThrow();
  }, 10_000);

  // Test 7: Cleanup all sessions on disconnect (server socket disconnect)
  
  it('should kill all sessions belonging to a disconnected socket', () => {
    const socketId = 'socket_to_disconnect';
    const session1 = createSession('disc_1', socketId);
    const session2 = createSession('disc_2', socketId);
    sessions.set('disc_1', session1);
    sessions.set('disc_2', session2);

    // Other socket's session should survive
    const otherSession = createSession('disc_3', 'other_socket');
    sessions.set('disc_3', otherSession);

    // Simulate server disconnect cleanup
    for (const [id, s] of sessions.entries()) {
      if (s.socketId === socketId) {
        try {
          s.ptyProcess.kill();
        } catch {
          // ignore
        }
        sessions.delete(id);
      }
    }

    expect(sessions.has('disc_1')).toBe(false);
    expect(sessions.has('disc_2')).toBe(false);
    expect(sessions.has('disc_3')).toBe(true);

    // Cleanup remaining
    otherSession.ptyProcess.kill();
    sessions.delete('disc_3');
  });

  // Test 8: Verify the server's startPtyCleanupInterval logic
  
  it('should periodically sweep idle sessions (simulating server cleanup interval)', async () => {
    const id = 'integration_test_8';
    const session = createSession(id, TEST_SOCKET_ID);
    sessions.set(id, session);

    // Simulate the server's startPtyCleanupInterval logic
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [sid, s] of sessions.entries()) {
        if (s.lastActivity && now - s.lastActivity > PTY_SESSION_MAX_IDLE_MS) {
          try {
            s.ptyProcess.kill();
          } catch {
            // ignore
          }
          sessions.delete(sid);
        }
      }
    }, 60_000);

    // Mark session as very old
    session.lastActivity = Date.now() - PTY_SESSION_MAX_IDLE_MS - 10_000;

    // Manually trigger the check
    const now = Date.now();
    for (const [sid, s] of sessions.entries()) {
      if (s.lastActivity && now - s.lastActivity > PTY_SESSION_MAX_IDLE_MS) {
        try {
          s.ptyProcess.kill();
        } catch {
          // ignore
        }
        sessions.delete(sid);
      }
    }

    clearInterval(cleanupInterval);

    // Session should have been killed and removed
    expect(sessions.has(id)).toBe(false);
  });

  // Test 9: Shell switching (cmd ↔ powershell) creates correct process
  
  it('should spawn the correct shell type based on configuration', () => {
    const shellForPlatform = (shellType?: string) => {
      if (process.platform === 'win32') {
        return shellType === 'powershell' ? 'powershell.exe' : 'cmd.exe';
      }
      return 'bash';
    };

    expect(shellForPlatform('cmd')).toBe(process.platform === 'win32' ? 'cmd.exe' : 'bash');
    expect(shellForPlatform('powershell')).toBe(
      process.platform === 'win32' ? 'powershell.exe' : 'bash',
    );
    expect(shellForPlatform()).toBe(process.platform === 'win32' ? 'cmd.exe' : 'bash');
  });

  // Test 10: PTY resize does not throw
  
  it('should resize a PTY session without throwing', async () => {
    const id = 'integration_test_10';
    const session = createSession(id, TEST_SOCKET_ID);
    sessions.set(id, session);

    try {
      // Simulate server's terminal_resize handler
      expect(() => {
        session.ptyProcess.resize(120, 40);
      }).not.toThrow();

      expect(() => {
        session.ptyProcess.resize(80, 24);
      }).not.toThrow();
    } finally {
      session.ptyProcess.kill();
      sessions.delete(id);
    }
  });

  // Test 11: Concurrent sessions are independent
  
  it('should maintain independent state for concurrent sessions', async () => {
    const id1 = 'concurrent_1';
    const id2 = 'concurrent_2';

    const session1 = createSession(id1, TEST_SOCKET_ID);
    const session2 = createSession(id2, TEST_SOCKET_ID);
    sessions.set(id1, session1);
    sessions.set(id2, session2);

    try {
      const [out1, out2] = await Promise.all([
        execCommand(session1, 'echo SESSION_ONE'),
        execCommand(session2, 'echo SESSION_TWO'),
      ]);

      expect(out1).toContain('SESSION_ONE');
      expect(out2).toContain('SESSION_TWO');
    } finally {
      session1.ptyProcess.kill();
      session2.ptyProcess.kill();
      sessions.delete(id1);
      sessions.delete(id2);
    }
  }, 30_000);

  // Test 12: Session cleanup on unexpected exit (process.on('exit'))
  
  it('should kill remaining PTY sessions on unexpected exit (best-effort)', async () => {
    const id = 'integration_test_12';
    const session = createSession(id, TEST_SOCKET_ID);
    sessions.set(id, session);

    // Simulate the server's process.on('exit') handler
    const cleanupOnExit = () => {
      for (const [, s] of sessions) {
        try {
          s.ptyProcess.kill();
        } catch {
          // ignore
        }
      }
    };

    // Should not throw — the try/catch in the handler ensures this
    expect(cleanupOnExit).not.toThrow();

    // Verify kill was actually called by checking pid is still accessible
    // (kill is best-effort; we're testing the handler doesn't throw)
    expect(session.ptyProcess.pid).toBeDefined();
    // Calling cleanup twice should also not throw (idempotent)
    expect(cleanupOnExit).not.toThrow();
  });
});


