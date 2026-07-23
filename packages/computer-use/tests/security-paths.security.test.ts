// ==============================================================================
// Security-path tests for dangerous surfaces (v0.1.5 P1.2)
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { SandboxSecurityFilter } from '../src/guardrails/index.js';

describe('computer-use security paths', () => {
  const filter = new SandboxSecurityFilter();

  it('denies recursive delete of root by default', () => {
    const result = filter.validateCommand('rm -rf /');
    expect(result.safe).toBe(false);
    expect(result.threats[0]?.severity).toBe('critical');
  });

  it('denies disk wipe patterns', () => {
    expect(filter.validateCommand('mkfs.ext4 /dev/sda1').safe).toBe(false);
    expect(filter.validateCommand('dd if=/dev/zero of=/dev/sda').safe).toBe(false);
  });

  it('allows benign commands', () => {
    const result = filter.validateCommand('ls -la');
    expect(result.safe).toBe(true);
  });
});
