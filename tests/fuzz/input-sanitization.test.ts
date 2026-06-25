import { describe, it, expect } from 'vitest';

describe('Fuzz - Input Sanitization', () => {
  const dangerousInputs = [
    "'; DROP TABLE users; --",
    '${process.env.SECRET}',
    '<script>alert("xss")</script>',
    '../../etc/passwd',
    '|| whoami',
    '`cat /etc/passwd`',
    '$(cat /etc/passwd)',
    '"; cat /etc/shadow; "',
    '../../.env',
    '%00',
    'NODE_ENV=production',
    '__proto__.toString',
    'constructor.constructor',
    '--help',
    '--version',
    '-rf /',
    '| shutdown -r now',
    '& del /F /S *.*',
  ];

  dangerousInputs.forEach((input) => {
    it(`escapeShellArg should handle: "${input.substring(0, 30)}"`, async () => {
      const { escapeShellArg } = await import('@ghita/skills');
      const escaped = escapeShellArg(input);
      expect(escaped).toBeDefined();
      expect(typeof escaped).toBe('string');
      // Escaped string should not equal input if input contains dangerous chars
      if (/[;'"`$()|&<>!\\ ]/.test(input)) {
        expect(escaped).not.toBe(input);
      }
    });

    it(`readString should handle: "${input.substring(0, 30)}"`, async () => {
      const { readString } = await import('@ghita/skills');
      const result = readString({ input }, 'input');
      expect(result).toBe(input); // readString is passthrough, sanitization is downstream
    });
  });

  it('should handle very long input strings', async () => {
    const { escapeShellArg } = await import('@ghita/skills');
    const longInput = 'A'.repeat(100000) + '; rm -rf /';
    const result = escapeShellArg(longInput);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThanOrEqual(100000);
    // The dangerous part should be escaped
    expect(result).not.toContain('; rm');
  });

  it('should handle empty strings', async () => {
    const { escapeShellArg } = await import('@ghita/skills');
    expect(escapeShellArg('')).toBe('');
  });

  it('should handle unicode and special characters', async () => {
    const { escapeShellArg } = await import('@ghita/skills');
    const unicodeInputs = [
      'hello 世界',
      'café au lait',
      '𝕞𝕒𝕥𝕙𝕤',
      '♻️🔒🚀',
      'null\x00byte',
      "tab\there",
      "newline\nhere",
    ];
    for (const input of unicodeInputs) {
      const result = escapeShellArg(input);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    }
  });
});
