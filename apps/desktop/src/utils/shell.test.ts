import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.fn();
const scanCommandMock = vi.fn();

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    create: vi.fn(() => ({
      execute: executeMock,
    })),
  },
}));

vi.mock('@ghita/ai-engine', () => ({
  SecurityGuard: {
    scanCommand: scanCommandMock,
  },
}));

describe('shell security', () => {
  beforeEach(() => {
    executeMock.mockReset();
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
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('executes safe commands normally', async () => {
    scanCommandMock.mockReturnValue({ safe: true });
    executeMock.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      code: 0,
    });

    const { executeShellCommand } = await import('./shell');
    const result = await executeShellCommand('echo ok');

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('ok');
    expect(executeMock).toHaveBeenCalledTimes(1);
  });
});
