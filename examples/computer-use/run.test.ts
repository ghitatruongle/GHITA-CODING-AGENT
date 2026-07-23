import { describe, it, expect } from 'vitest';
import { runComputerUseDryRun, validateDryRunCommand } from './run.mjs';

describe('computer-use example', () => {
  it('denies destructive commands and allows ls', () => {
    expect(validateDryRunCommand('ls -la').safe).toBe(true);
    expect(validateDryRunCommand('rm -rf /').safe).toBe(false);
    const report = runComputerUseDryRun();
    expect(report.some((r) => r.cmd === 'rm -rf /' && r.safe === false)).toBe(true);
  });
});
