import { describe, it, expect } from 'vitest';

describe('Skills - Security Helpers', () => {
  it('escapeShellArg should escape spaces', async () => {
    const { escapeShellArg } = await import('@ghita/skills');
    expect(escapeShellArg('hello world')).toBe('hello\\ world');
  });

  it('escapeShellArg should escape semicolons', async () => {
    const { escapeShellArg } = await import('@ghita/skills');
    expect(escapeShellArg("echo hello; rm -rf /")).toContain('\\;');
  });

  it('escapeShellArg should escape quotes', async () => {
    const { escapeShellArg } = await import('@ghita/skills');
    const result = escapeShellArg("it's dangerous");
    expect(result).toContain("\\'");
  });

  it('escapeShellArg should escape backticks', async () => {
    const { escapeShellArg } = await import('@ghita/skills');
    const result = escapeShellArg('`whoami`');
    expect(result).not.toContain('whoami');
  });

  it('escapeShellArg should escape dollar signs', async () => {
    const { escapeShellArg } = await import('@ghita/skills');
    const result = escapeShellArg('$(cat /etc/passwd)');
    expect(result).not.toContain('$(cat');
  });

  it('escapePowerShellString should handle normal strings', async () => {
    const { escapePowerShellString } = await import('@ghita/skills');
    expect(escapePowerShellString('normal')).toBe('normal');
  });

  it('ok helper should return success result', async () => {
    const { ok } = await import('@ghita/skills');
    const result = ok('test data');
    expect(result.success).toBe(true);
    expect(result.data).toBe('test data');
  });

  it('fail helper should return error result', async () => {
    const { fail } = await import('@ghita/skills');
    const result = fail('something went wrong');
    expect(result.success).toBe(false);
    expect(result.error).toContain('went wrong');
  });

  it('readString should parse string arguments', async () => {
    const { readString } = await import('@ghita/skills');
    expect(readString({ path: '/tmp/test.txt' }, 'path')).toBe('/tmp/test.txt');
    expect(readString({} as any, 'missing')).toBeUndefined();
  });

  it('readNumber should parse numeric arguments', async () => {
    const { readNumber } = await import('@ghita/skills');
    expect(readNumber({ count: '42' }, 'count')).toBe(42);
    expect(readNumber({} as any, 'missing')).toBeUndefined();
  });

  it('readBoolean should parse boolean arguments', async () => {
    const { readBoolean } = await import('@ghita/skills');
    expect(readBoolean({ flag: 'true' }, 'flag')).toBe(true);
    expect(readBoolean({ flag: 'false' }, 'flag')).toBe(false);
  });
});
