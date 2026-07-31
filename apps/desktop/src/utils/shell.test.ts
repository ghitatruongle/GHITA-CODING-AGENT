import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
const scanCommandMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@ghita/ai-engine', () => ({
  SecurityGuard: {
    scanCommand: scanCommandMock,
  },
}));

describe('shell security', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    scanCommandMock.mockReset();
  });

  it('blocks critical commands before execution', async () => {
    // executeShellCommand uses its own assessShellCommand with MALICIOUS_PATTERNS,
    // not the mocked SecurityGuard.scanCommand. The rm -rf pattern is matched
    // internally and returns a Vietnamese security reason.
    const { executeShellCommand } = await import('./shell');
    const result = await executeShellCommand('rm -rf /');

    expect(result.success).toBe(false);
    expect(result.stderr).toContain('rm -rf');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('executes safe commands normally', async () => {
    scanCommandMock.mockReturnValue({ safe: true });
    invokeMock.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      code: 0,
      success: true,
    });

    const { executeShellCommand } = await import('./shell');
    const result = await executeShellCommand('echo ok');

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('ok');
    expect(invokeMock).toHaveBeenCalledWith('execute_approved_command', {
      command: 'echo ok',
      shell: 'cmd',
      cwd: undefined,
      timeoutMs: 120_000,
    });
  });

  it('forwards a caller-provided native timeout', async () => {
    invokeMock.mockResolvedValue({ stdout: '', stderr: '', code: 0, success: true });

    const { executeShellCommand } = await import('./shell');
    await executeShellCommand('pnpm test', 'cmd', 'D:\\workspace', 30_000);

    expect(invokeMock).toHaveBeenCalledWith(
      'execute_approved_command',
      expect.objectContaining({ timeoutMs: 30_000 }),
    );
  });
});
