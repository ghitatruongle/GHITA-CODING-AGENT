import { describe, it, expect } from 'vitest';
import { SandboxRunner } from '../src/sandbox/runner.js';
import { registerNative, unregisterNative } from '@ghita/native-bridge';

describe('SandboxRunner', () => {
  it('blocks destructive commands via execution policy before spawn', async () => {
    const runner = new SandboxRunner();
    const result = await runner.run('git', ['push', '--force', 'origin', 'main']);

    expect(result.blocked).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]?.reason).toBe('exec-policy-deny');
    expect(result.stderr).toContain('governance:deny');
  });

  it('blocks Windows destructive commands (format, diskpart)', async () => {
    const runner = new SandboxRunner();
    const resFormat = await runner.run('format', ['C:']);
    expect(resFormat.blocked).toBe(true);
    expect(resFormat.violations[0]?.reason).toBe('exec-policy-deny');

    const resDiskpart = await runner.run('diskpart', []);
    expect(resDiskpart.blocked).toBe(true);
    expect(resDiskpart.violations[0]?.reason).toBe('exec-policy-deny');
  });

  it('runs safe commands through native bridge or fallback', async () => {
    const runner = new SandboxRunner();
    const result = await runner.run(process.platform === 'win32' ? 'cmd.exe' : 'echo', [
      ...(process.platform === 'win32' ? ['/C', 'echo sandbox_ok'] : ['sandbox_ok']),
    ]);

    expect(result.blocked).toBe(false);
    expect(result.stdout).toContain('sandbox_ok');
  });

  it('handles simulated native addon execution', async () => {
    registerNative('sandbox', {
      spawnSandboxed: (cmd: string, args: string[], _opts: unknown) => ({
        exitCode: 0,
        stdout: `mocked_${cmd}_${args.join('_')}`,
        stderr: '',
        durationMs: 12,
        enforcement: 'supervised',
        violations: [],
        blocked: false,
      }),
    });

    try {
      const runner = new SandboxRunner();
      const result = await runner.run('node', ['-v']);

      expect(result.blocked).toBe(false);
      expect(result.stdout).toBe('mocked_node_-v');
      expect(result.enforcement).toBe('supervised');
    } finally {
      unregisterNative('sandbox');
    }
  });

  it('flags commands requiring confirmation (ask effect)', async () => {
    const runner = new SandboxRunner();
    // Simulate native runner for echo with ask flag
    registerNative('sandbox', {
      spawnSandboxed: () => ({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        durationMs: 5,
        enforcement: 'supervised',
        violations: [],
        blocked: false,
      }),
    });

    try {
      const result = await runner.run('git', ['push', '--force-with-lease', 'origin', 'main']);
      expect(result.requiresApproval).toBe(true);
    } finally {
      unregisterNative('sandbox');
    }
  });
});
