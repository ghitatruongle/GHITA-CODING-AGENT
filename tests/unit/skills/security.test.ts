import { describe, it, expect } from 'vitest';
import {
  escapeShellArg,
  escapePowerShellString,
  ok,
  fail,
  readString,
  readNumber,
  readBoolean,
} from '@ghita/skills';

describe('Skills - Security Helpers', () => {
  it('escapeShellArg should escape spaces', () => {
    expect(escapeShellArg('hello world')).toBe("'hello world'");
  });

  it('escapeShellArg should escape semicolons', () => {
    // Single-quote wrapping neutralizes semicolons
    expect(escapeShellArg('echo hello; rm -rf /')).toBe("'echo hello; rm -rf /'");
  });

  it('escapeShellArg should escape quotes', () => {
    const result = escapeShellArg("it's dangerous");
    // Internal single quotes are escaped via '\'' pattern
    expect(result).toBe("'it'\\''s dangerous'");
  });

  it('escapeShellArg should escape backticks', () => {
    const result = escapeShellArg('`whoami`');
    expect(result).not.toContain('whoami');
  });

  it('escapeShellArg should escape dollar signs', () => {
    const result = escapeShellArg('$(cat /etc/passwd)');
    expect(result).not.toContain('$(cat');
  });

  it('escapePowerShellString should handle normal strings', () => {
    expect(escapePowerShellString('normal')).toBe("'normal'");
  });

  it('ok helper should return success result', () => {
    const result = ok('test data');
    expect(result.success).toBe(true);
    expect(result.data).toBe('test data');
  });

  it('fail helper should return error result', () => {
    const result = fail('something went wrong');
    expect(result.success).toBe(false);
    expect(result.error).toContain('went wrong');
  });

  it('readString should parse string arguments', () => {
    expect(readString({ path: '/tmp/test.txt' }, 'path')).toBe('/tmp/test.txt');
    expect(readString({} as any, 'missing')).toBeUndefined();
  });

  it('readNumber should parse numeric arguments', () => {
    expect(readNumber({ count: '42' }, 'count')).toBe(42);
    expect(readNumber({} as any, 'missing')).toBeUndefined();
  });

  it('readBoolean should parse boolean arguments', () => {
    expect(readBoolean({ flag: 'true' }, 'flag')).toBe(true);
    expect(readBoolean({ flag: 'false' }, 'flag')).toBe(false);
  });
});
